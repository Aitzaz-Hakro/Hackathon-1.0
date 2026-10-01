-- =============================================================================
-- 0005_availability_and_waitlist.sql
-- Availability visibility + waitlist promotion.
--
-- Run after 0004_seed_reference.sql.
--
-- Found while building the application layer: two RLS-adjacent gaps made the
-- user-facing booking flow impossible as specified.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Busy slots, visible to everyone
--
-- RLS on `bookings` lets a caller read only their own rows (staff read all).
-- That is right for booking *details* but wrong for *availability*: a student
-- cannot see that a lab is taken, so the wizard's conflict check would find
-- nothing and the timeline grid would render empty.
--
-- This view exposes only the intervals a lab is committed for — no user, no
-- purpose, no id — which is exactly what a booking calendar is expected to
-- show. Pending requests are included so two students cannot request the same
-- slot unopposed; the EXCLUDE constraint remains the hard backstop once a
-- booking is approved.
-- -----------------------------------------------------------------------------

create or replace view lab_busy_slots as
select
  b.lab_id,
  b.booking_date,
  b.start_time,
  b.end_time,
  b.booking_status
from bookings b
where b.lab_id is not null
  and b.booking_status in ('pending_approval', 'approved', 'reserved', 'in_use', 'overdue');

-- Deliberately NOT security_invoker: every caller must see every interval.
-- The exposed columns carry no personal data.
comment on view lab_busy_slots is
  'Lab occupancy intervals, readable by any authenticated user. Intervals only — no booking details.';

grant select on lab_busy_slots to authenticated;

-- -----------------------------------------------------------------------------
-- 2. equipment_availability — definer rights, and overdue counted as out
--
-- 0002_rls.sql set security_invoker = true on this view. That is wrong for a
-- derived aggregate: with invoker rights a student's query counts only their
-- own `booking_equipment` rows (that table's RLS is owner-scoped), so every
-- item would look almost fully available even when the lab is out of stock.
--
-- The redefinition also fixes a counting gap: `overdue` was missing from both
-- buckets, so units that were never returned appeared free. Overdue stock is
-- still physically out, so it belongs with `in_use`.
--
-- The view holds equipment-level totals and nothing user-specific, so definer
-- rights leak nothing `equipment` (readable by every authenticated user) does
-- not already expose.
-- -----------------------------------------------------------------------------

create or replace view equipment_availability as
select
  e.id                as equipment_id,
  e.name,
  e.asset_code,
  e.category_id,
  e.lab_id,
  e.total_quantity,
  coalesce(reserved.qty, 0)                              as reserved_quantity,
  coalesce(in_use.qty, 0)                                as in_use_quantity,
  greatest(e.total_quantity - coalesce(reserved.qty, 0) - coalesce(in_use.qty, 0), 0) as available_quantity,
  e.condition,
  e.maintenance_status,
  e.damage_count
from equipment e
left join (
  select be.equipment_id, sum(be.quantity) as qty
  from booking_equipment be
  join bookings b on b.id = be.booking_id
  where b.booking_status in ('approved', 'reserved')
  group by be.equipment_id
) reserved on reserved.equipment_id = e.id
left join (
  select be.equipment_id, sum(be.quantity) as qty
  from booking_equipment be
  join bookings b on b.id = be.booking_id
  where b.booking_status in ('in_use', 'overdue')
  group by be.equipment_id
) in_use on in_use.equipment_id = e.id;

alter view equipment_availability set (security_invoker = false);

grant select on equipment_availability to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Waitlist promotion
--
-- Called when an active lab booking is cancelled. Picks the earliest waiting
-- entry whose window overlaps the freed slot, marks it promoted and notifies
-- the holder with a link to the booking form.
--
-- SECURITY DEFINER because the caller is typically a student: RLS on
-- `waitlist` allows updating only your own row, so promoting someone else's
-- must run with elevated rights. The function touches one row and writes one
-- notification, so the elevated path is narrow.
-- -----------------------------------------------------------------------------

create or replace function promote_waitlist(
  p_lab   uuid,
  p_date  date,
  p_start time,
  p_end   time
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  promoted_id   uuid;
  promoted_user uuid;
begin
  select w.id, w.user_id into promoted_id, promoted_user
  from waitlist w
  where w.lab_id = p_lab
    and w.booking_date = p_date
    and w.status = 'waiting'
    -- Half-open overlap, matching tsrange and the app's windowsOverlap().
    and w.start_time < p_end
    and w.end_time > p_start
  order by w.position, w.created_at
  limit 1;

  if promoted_id is null then
    return null;
  end if;

  update waitlist set status = 'promoted' where id = promoted_id;

  perform notify_user(
    promoted_user,
    'A slot opened up',
    format(
      'The %s slot from %s to %s you were waiting for is now free. Book it before someone else does.',
      p_date, p_start, p_end
    ),
    '/bookings/new',
    'waitlist'
  );

  return promoted_id;
end;
$$;

grant execute on function promote_waitlist(uuid, date, time, time) to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Waitlist position
--
-- Callers must be told their place in line, but RLS on `waitlist` only lets a
-- user read their own rows. The count of people ahead has to come from a
-- SECURITY DEFINER function for the same reason as promotion.
-- -----------------------------------------------------------------------------

create or replace function waitlist_position(
  p_lab   uuid,
  p_date  date,
  p_start time,
  p_end   time
)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer + 1
  from waitlist w
  where w.lab_id = p_lab
    and w.booking_date = p_date
    and w.status = 'waiting'
    and w.start_time < p_end
    and w.end_time > p_start;
$$;

grant execute on function waitlist_position(uuid, date, time, time) to authenticated;
