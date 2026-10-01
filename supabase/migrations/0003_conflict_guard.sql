-- =============================================================================
-- 0003_conflict_guard.sql
-- Database-enforced double-booking prevention.
--
-- Run after 0002_rls.sql.
--
-- Application code pre-checks availability so users get a helpful message and
-- ranked alternatives. That pre-check is inherently racy: two users submitting
-- the same slot a few milliseconds apart both pass the check, then both insert.
-- This constraint closes that window — the second INSERT fails at the database.
--
-- The Server Action must catch the resulting error and translate it, or the
-- user sees a raw Postgres error string. See the `is_conflict_error` helper.
-- =============================================================================

create extension if not exists btree_gist;

-- -----------------------------------------------------------------------------
-- Lab double-booking
--
-- Only bookings in an active state occupy the room. Drafts, pending requests,
-- rejections and cancellations do not block a slot — otherwise a never-approved
-- request would hold a lab hostage.
--
-- The active set matches the rulebook's "time slot and equipment are reserved"
-- step: approval through to completion.
-- -----------------------------------------------------------------------------

alter table bookings drop constraint if exists bookings_no_lab_overlap;

alter table bookings
  add constraint bookings_no_lab_overlap
  exclude using gist (
    lab_id with =,
    tsrange(
      (booking_date + start_time)::timestamp,
      (booking_date + end_time)::timestamp
    ) with &&
  )
  where (
    lab_id is not null
    and booking_status in ('approved', 'reserved', 'in_use', 'overdue')
  );

comment on constraint bookings_no_lab_overlap on bookings is
  'Prevents two active bookings occupying the same lab over overlapping times. '
  'Adjacent bookings (one ending exactly when the next begins) are allowed — '
  'tsrange is half-open by default.';

-- -----------------------------------------------------------------------------
-- Mapping the constraint violation to a message the UI can show
-- -----------------------------------------------------------------------------

create or replace function is_conflict_error(err_msg text)
returns boolean
language sql
immutable
as $$
  select err_msg ilike '%bookings_no_lab_overlap%'
      or err_msg ilike '%conflicting key value violates exclusion constraint%';
$$;

-- -----------------------------------------------------------------------------
-- Equipment conflicts
--
-- An EXCLUDE constraint cannot express "sum of quantities across a joined table
-- must not exceed total_quantity" — it operates on a single row. Equipment
-- over-allocation is therefore guarded by a BEFORE INSERT/UPDATE trigger that
-- sums concurrent demand for the same equipment over an overlapping window.
--
-- This catches the same race as the lab constraint, at row-insert time.
-- -----------------------------------------------------------------------------

create or replace function check_equipment_availability()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parent        bookings;
  demand_row    record;
  total         integer;
  competing     integer;
begin
  select * into parent from bookings where id = new.booking_id;

  -- Only active bookings consume stock.
  if parent.booking_status not in ('approved', 'reserved', 'in_use', 'overdue') then
    return new;
  end if;

  select total_quantity into total
  from equipment where id = new.equipment_id;

  if total is null then
    raise exception 'Equipment % does not exist', new.equipment_id;
  end if;

  -- Demand from other active bookings whose window overlaps this one.
  select coalesce(sum(be.quantity), 0) into competing
  from booking_equipment be
  join bookings b on b.id = be.booking_id
  where be.equipment_id = new.equipment_id
    and be.id <> new.id
    and b.booking_status in ('approved', 'reserved', 'in_use', 'overdue')
    and b.booking_date = parent.booking_date
    and tsrange(
          (b.booking_date + b.start_time)::timestamp,
          (b.booking_date + b.end_time)::timestamp
        )
        && tsrange(
          (parent.booking_date + parent.start_time)::timestamp,
          (parent.booking_date + parent.end_time)::timestamp
        );

  if competing + new.quantity > total then
    raise exception
      'Insufficient equipment: % of % units are already committed for that window; % requested, % total.',
      competing, total, new.quantity, total
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists booking_equipment_check on booking_equipment;
create trigger booking_equipment_check
  before insert or update on booking_equipment
  for each row execute function check_equipment_availability();

-- The trigger does not fire when a booking *transitions into* an active state,
-- since it only watches booking_equipment. Re-validate the lines at that point.
create or replace function check_booking_activation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  line        record;
  total       integer;
  competing   integer;
begin
  -- Only care about transitions into an active state.
  if new.booking_status not in ('approved', 'reserved', 'in_use', 'overdue') then
    return new;
  end if;
  if old.booking_status = new.booking_status then
    return new;
  end if;

  for line in
    select be.equipment_id, be.quantity
    from booking_equipment be
    where be.booking_id = new.id
  loop
    select total_quantity into total from equipment where id = line.equipment_id;

    select coalesce(sum(be.quantity), 0) into competing
    from booking_equipment be
    join bookings b on b.id = be.booking_id
    where be.equipment_id = line.equipment_id
      and be.booking_id <> new.id
      and b.booking_status in ('approved', 'reserved', 'in_use', 'overdue')
      and b.booking_date = new.booking_date
      and tsrange(
            (b.booking_date + b.start_time)::timestamp,
            (b.booking_date + b.end_time)::timestamp
          )
          && tsrange(
            (new.booking_date + new.start_time)::timestamp,
            (new.booking_date + new.end_time)::timestamp
          );

    if competing + line.quantity > total then
      raise exception
        'Cannot approve: only % of % units remain for that window.',
        greatest(total - competing, 0), total
        using errcode = 'check_violation';
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists bookings_activation_check on bookings;
create trigger bookings_activation_check
  before update on bookings
  for each row execute function check_booking_activation();
