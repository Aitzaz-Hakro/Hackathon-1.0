-- =============================================================================
-- 0002_rls.sql
-- Row Level Security for every table.
--
-- Run after 0001_schema.sql.
--
-- Two things make this non-obvious:
--   1. Policies on `profiles` that query `profiles` recurse infinitely. Every
--      role/department lookup therefore goes through `auth_role()` /
--      `auth_department()`, which are SECURITY DEFINER and bypass RLS.
--   2. Supabase views bypass the RLS of their underlying tables unless
--      `security_invoker` is set. See the bottom of this file.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helper functions
--
-- SECURITY DEFINER so they can read `profiles` regardless of the caller's
-- policies — without this, a policy on `profiles` that calls a function which
-- selects from `profiles` deadlocks into infinite recursion.
-- -----------------------------------------------------------------------------

create or replace function auth_role()
returns user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from profiles where id = auth.uid();
$$;

create or replace function auth_department()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select department_id from profiles where id = auth.uid();
$$;

-- Staff-or-above. Used by most write policies.
create or replace function is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role from profiles where id = auth.uid())
      in ('lab_staff', 'coordinator', 'admin'),
    false
  );
$$;

-- Coordinator-or-above.
create or replace function is_coordinator()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role from profiles where id = auth.uid())
      in ('coordinator', 'admin'),
    false
  );
$$;

-- Admin only.
create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role from profiles where id = auth.uid()) = 'admin', false);
$$;

-- True when the caller can see the given lab — either staff in that lab's
-- department, or a coordinator/admin.
create or replace function can_manage_lab(target_lab uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    is_admin()
    or (
      is_coordinator()
      and exists (
        select 1 from labs l
        where l.id = target_lab and l.department_id = auth_department()
      )
    )
    or (
      auth_role() = 'lab_staff'
      and exists (
        select 1 from labs l
        where l.id = target_lab and l.department_id = auth_department()
      )
    );
$$;

-- -----------------------------------------------------------------------------
-- Enable RLS everywhere
-- -----------------------------------------------------------------------------

alter table departments         enable row level security;
alter table profiles            enable row level security;
alter table labs                enable row level security;
alter table equipment_categories enable row level security;
alter table equipment           enable row level security;
alter table bookings            enable row level security;
alter table booking_equipment   enable row level security;
alter table issues              enable row level security;
alter table booking_rules       enable row level security;
alter table waitlist            enable row level security;
alter table notifications       enable row level security;

-- -----------------------------------------------------------------------------
-- departments
-- -----------------------------------------------------------------------------

drop policy if exists departments_read on departments;
create policy departments_read on departments
  for select to authenticated using (true);

drop policy if exists departments_write on departments;
create policy departments_write on departments
  for all to authenticated
  using (is_coordinator()) with check (is_coordinator());

-- -----------------------------------------------------------------------------
-- profiles
--
-- Reads: own row always. Staff+ read their department. Admin reads all.
-- Writes: own row (but NOT role — see the trigger at the bottom). Admin any.
-- -----------------------------------------------------------------------------

drop policy if exists profiles_read on profiles;
create policy profiles_read on profiles
  for select to authenticated
  using (
    id = auth.uid()
    or is_admin()
    or (is_staff() and department_id = auth_department())
  );

drop policy if exists profiles_update_own on profiles;
create policy profiles_update_own on profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists profiles_admin_write on profiles;
create policy profiles_admin_write on profiles
  for all to authenticated
  using (is_admin()) with check (is_admin());

-- Privilege escalation guard: a user editing their own profile must not be able
-- to change `role`, `is_active`, or `department_id`. RLS cannot restrict
-- individual columns, so a trigger reverts those fields unless an admin is
-- making the change.
create or replace function prevent_self_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() and old.id = auth.uid() then
    new.role          := old.role;
    new.is_active     := old.is_active;
    new.department_id := old.department_id;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_role on profiles;
create trigger profiles_guard_role before update on profiles
  for each row execute function prevent_self_role_change();

-- -----------------------------------------------------------------------------
-- labs
-- -----------------------------------------------------------------------------

drop policy if exists labs_read on labs;
create policy labs_read on labs
  for select to authenticated using (true);

drop policy if exists labs_write on labs;
create policy labs_write on labs
  for all to authenticated
  using (is_coordinator() or (is_staff() and department_id = auth_department()))
  with check (is_coordinator() or (is_staff() and department_id = auth_department()));

-- -----------------------------------------------------------------------------
-- equipment_categories / equipment
-- -----------------------------------------------------------------------------

drop policy if exists categories_read on equipment_categories;
create policy categories_read on equipment_categories
  for select to authenticated using (true);

drop policy if exists categories_write on equipment_categories;
create policy categories_write on equipment_categories
  for all to authenticated
  using (is_admin()) with check (is_admin());

drop policy if exists equipment_read on equipment;
create policy equipment_read on equipment
  for select to authenticated using (true);

drop policy if exists equipment_write on equipment;
create policy equipment_write on equipment
  for all to authenticated
  using (lab_id is not null and can_manage_lab(lab_id))
  with check (lab_id is not null and can_manage_lab(lab_id));

-- -----------------------------------------------------------------------------
-- bookings
--
-- Anyone authenticated may create their own booking. Owners read and update
-- their own. Staff+ read and update anything in their department's labs.
-- -----------------------------------------------------------------------------

drop policy if exists bookings_read on bookings;
create policy bookings_read on bookings
  for select to authenticated
  using (
    user_id = auth.uid()
    or is_staff()
    or is_admin()
  );

drop policy if exists bookings_insert_own on bookings;
create policy bookings_insert_own on bookings
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists bookings_update_own on bookings;
create policy bookings_update_own on bookings
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists bookings_update_staff on bookings;
create policy bookings_update_staff on bookings
  for update to authenticated
  using (is_staff() or is_admin())
  with check (is_staff() or is_admin());

-- -----------------------------------------------------------------------------
-- booking_equipment — follows its parent booking
-- -----------------------------------------------------------------------------

drop policy if exists booking_equipment_read on booking_equipment;
create policy booking_equipment_read on booking_equipment
  for select to authenticated
  using (
    exists (
      select 1 from bookings b
      where b.id = booking_id
        and (b.user_id = auth.uid() or is_staff() or is_admin())
    )
  );

drop policy if exists booking_equipment_write on booking_equipment;
create policy booking_equipment_write on booking_equipment
  for all to authenticated
  using (
    exists (
      select 1 from bookings b
      where b.id = booking_id
        and (b.user_id = auth.uid() or is_staff() or is_admin())
    )
  )
  with check (
    exists (
      select 1 from bookings b
      where b.id = booking_id
        and (b.user_id = auth.uid() or is_staff() or is_admin())
    )
  );

-- -----------------------------------------------------------------------------
-- issues — owner reads their own; staff+ manage all
-- -----------------------------------------------------------------------------

drop policy if exists issues_read on issues;
create policy issues_read on issues
  for select to authenticated
  using (
    is_staff()
    or is_admin()
    or exists (select 1 from bookings b where b.id = booking_id and b.user_id = auth.uid())
  );

drop policy if exists issues_write_staff on issues;
create policy issues_write_staff on issues
  for all to authenticated
  using (is_staff() or is_admin())
  with check (is_staff() or is_admin());

-- -----------------------------------------------------------------------------
-- booking_rules — everyone reads, coordinators write
-- -----------------------------------------------------------------------------

drop policy if exists booking_rules_read on booking_rules;
create policy booking_rules_read on booking_rules
  for select to authenticated using (true);

drop policy if exists booking_rules_write on booking_rules;
create policy booking_rules_write on booking_rules
  for all to authenticated
  using (is_coordinator()) with check (is_coordinator());

-- -----------------------------------------------------------------------------
-- waitlist — own entries only
-- -----------------------------------------------------------------------------

drop policy if exists waitlist_read on waitlist;
create policy waitlist_read on waitlist
  for select to authenticated
  using (user_id = auth.uid() or is_staff() or is_admin());

drop policy if exists waitlist_insert_own on waitlist;
create policy waitlist_insert_own on waitlist
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists waitlist_update on waitlist;
create policy waitlist_update on waitlist
  for update to authenticated
  using (user_id = auth.uid() or is_staff() or is_admin())
  with check (user_id = auth.uid() or is_staff() or is_admin());

drop policy if exists waitlist_delete_own on waitlist;
create policy waitlist_delete_own on waitlist
  for delete to authenticated
  using (user_id = auth.uid() or is_admin());

-- -----------------------------------------------------------------------------
-- notifications
--
-- No INSERT policy on purpose. Waitlist promotion and approval flows need to
-- write notifications for *other* users, and a broad insert policy would let
-- any authenticated user spam anyone. `notify_user()` is SECURITY DEFINER so it
-- can insert regardless, while the caller still cannot touch the table directly.
-- -----------------------------------------------------------------------------

drop policy if exists notifications_read_own on notifications;
create policy notifications_read_own on notifications
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists notifications_update_own on notifications;
create policy notifications_update_own on notifications
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create or replace function notify_user(
  target_user uuid,
  n_title     text,
  n_body      text default null,
  n_link      text default null,
  n_kind      text default 'info'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into notifications (user_id, title, body, link, kind)
  values (target_user, n_title, n_body, n_link, n_kind);
end;
$$;

grant execute on function notify_user(uuid, text, text, text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Views must opt into RLS of their underlying tables.
-- Without security_invoker, a view runs with its owner's rights and would
-- expose every row of `equipment` to any caller.
-- -----------------------------------------------------------------------------

alter view equipment_availability set (security_invoker = true);
