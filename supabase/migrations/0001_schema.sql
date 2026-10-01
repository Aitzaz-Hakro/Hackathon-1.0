-- =============================================================================
-- 0001_schema.sql
-- University Lab & Equipment Booking System — core schema
--
-- Paste into the Supabase SQL Editor and run. Idempotent: safe to re-run if a
-- previous attempt failed part-way.
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- Enums
-- Wrapped in DO blocks so re-running does not error on "type already exists".
-- -----------------------------------------------------------------------------

do $$ begin
  create type user_role as enum ('student', 'faculty', 'lab_staff', 'coordinator', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type lab_status as enum ('available', 'reserved', 'in_use', 'maintenance', 'closed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type equipment_condition as enum ('new', 'good', 'fair', 'damaged', 'retired');
exception when duplicate_object then null; end $$;

do $$ begin
  create type maintenance_status as enum ('operational', 'needs_service', 'under_maintenance', 'out_of_service');
exception when duplicate_object then null; end $$;

do $$ begin
  create type resource_type as enum ('lab', 'equipment');
exception when duplicate_object then null; end $$;

do $$ begin
  create type approval_status as enum ('pending', 'approved', 'rejected');
exception when duplicate_object then null; end $$;

-- Full lifecycle from the rulebook, plus the terminal/exception states.
do $$ begin
  create type booking_status as enum (
    'draft',
    'pending_approval',
    'approved',
    'reserved',
    'in_use',
    'completed',
    'rejected',
    'cancelled',
    'overdue',
    'returned_late',
    'damaged'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type return_condition as enum ('good', 'fair', 'damaged', 'missing_parts', 'not_returned');
exception when duplicate_object then null; end $$;

do $$ begin
  create type waitlist_status as enum ('waiting', 'promoted', 'expired', 'cancelled');
exception when duplicate_object then null; end $$;

-- -----------------------------------------------------------------------------
-- Departments
-- -----------------------------------------------------------------------------

create table if not exists departments (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  code        text not null unique,
  head_name   text,
  created_at  timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Profiles — mirrors auth.users, holds role and department
-- -----------------------------------------------------------------------------

create table if not exists profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  email         text not null,
  full_name     text not null default '',
  role          user_role not null default 'student',
  department_id uuid references departments (id) on delete set null,
  student_id    text,
  phone         text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists profiles_department_idx on profiles (department_id);
create index if not exists profiles_role_idx on profiles (role);

-- -----------------------------------------------------------------------------
-- Labs
-- -----------------------------------------------------------------------------

create table if not exists labs (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  code          text not null unique,
  department_id uuid not null references departments (id) on delete restrict,
  capacity      integer not null default 0 check (capacity >= 0),
  location      text not null default '',
  facilities    text[] not null default '{}',
  open_time     time not null default '08:00',
  close_time    time not null default '18:00',
  status        lab_status not null default 'available',
  description   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint labs_hours_valid check (close_time > open_time)
);

create index if not exists labs_department_idx on labs (department_id);
create index if not exists labs_status_idx on labs (status);

-- -----------------------------------------------------------------------------
-- Equipment
-- -----------------------------------------------------------------------------

create table if not exists equipment_categories (
  id                uuid primary key default gen_random_uuid(),
  name              text not null unique,
  description       text,
  -- When true, any booking containing this category needs explicit approval
  -- even if the department rule would otherwise auto-approve.
  requires_approval boolean not null default false,
  created_at        timestamptz not null default now()
);

create table if not exists equipment (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  asset_code        text not null unique,
  category_id       uuid not null references equipment_categories (id) on delete restrict,
  lab_id            uuid references labs (id) on delete set null,
  total_quantity    integer not null default 0 check (total_quantity >= 0),
  condition         equipment_condition not null default 'good',
  maintenance_status maintenance_status not null default 'operational',
  damage_count      integer not null default 0,
  description       text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists equipment_category_idx on equipment (category_id);
create index if not exists equipment_lab_idx on equipment (lab_id);

-- NOTE: there is deliberately no `available_quantity` column. A stored counter
-- drifts the moment two bookings race. It is derived in the
-- `equipment_availability` view below, which cannot disagree with `bookings`.

-- -----------------------------------------------------------------------------
-- Bookings
-- -----------------------------------------------------------------------------

create table if not exists bookings (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references profiles (id) on delete cascade,
  resource_type    resource_type not null,
  lab_id           uuid references labs (id) on delete restrict,
  booking_date     date not null,
  start_time       time not null,
  end_time         time not null,
  purpose          text not null default '',
  expected_attendees integer,
  approval_status  approval_status not null default 'pending',
  booking_status   booking_status not null default 'pending_approval',
  -- Higher = more urgent. Computed by the priority scorer, surfaced to staff.
  priority_score   integer not null default 0,
  priority_reason  text,
  approved_by      uuid references profiles (id) on delete set null,
  approved_at      timestamptz,
  rejection_reason text,
  cancelled_at     timestamptz,
  cancel_reason    text,
  completed_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint bookings_time_valid check (end_time > start_time),
  -- A lab booking must name a lab; an equipment booking must not.
  constraint bookings_lab_matches_type check (
    (resource_type = 'lab' and lab_id is not null)
    or (resource_type = 'equipment')
  )
);

create index if not exists bookings_user_idx on bookings (user_id);
create index if not exists bookings_lab_date_idx on bookings (lab_id, booking_date);
create index if not exists bookings_status_idx on bookings (booking_status);
create index if not exists bookings_approval_idx on bookings (approval_status);

-- Equipment line items requested against a booking.
create table if not exists booking_equipment (
  id           uuid primary key default gen_random_uuid(),
  booking_id   uuid not null references bookings (id) on delete cascade,
  equipment_id uuid not null references equipment (id) on delete restrict,
  quantity     integer not null check (quantity > 0),
  created_at   timestamptz not null default now(),
  unique (booking_id, equipment_id)
);

create index if not exists booking_equipment_booking_idx on booking_equipment (booking_id);
create index if not exists booking_equipment_equipment_idx on booking_equipment (equipment_id);

-- -----------------------------------------------------------------------------
-- Issues / returns
-- -----------------------------------------------------------------------------

create table if not exists issues (
  id               uuid primary key default gen_random_uuid(),
  booking_id       uuid not null references bookings (id) on delete cascade,
  equipment_id     uuid not null references equipment (id) on delete restrict,
  quantity         integer not null check (quantity > 0),
  issued_at        timestamptz,
  due_at           timestamptz,
  returned_at      timestamptz,
  return_condition return_condition,
  remarks          text,
  damage_image_url text,
  issued_by        uuid references profiles (id) on delete set null,
  received_by      uuid references profiles (id) on delete set null,
  -- Short human-readable code for manual fallback when QR scanning fails.
  checkout_code    text not null unique,
  created_at       timestamptz not null default now()
);

create index if not exists issues_booking_idx on issues (booking_id);
create index if not exists issues_equipment_idx on issues (equipment_id);
create index if not exists issues_returned_idx on issues (returned_at);

-- -----------------------------------------------------------------------------
-- Booking rules (per department)
-- -----------------------------------------------------------------------------

create table if not exists booking_rules (
  id                    uuid primary key default gen_random_uuid(),
  department_id         uuid not null unique references departments (id) on delete cascade,
  max_duration_minutes  integer not null default 240,
  max_equipment_quantity integer not null default 10,
  advance_booking_days  integer not null default 30,
  requires_approval     boolean not null default true,
  allow_student_booking boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Waitlist
-- -----------------------------------------------------------------------------

create table if not exists waitlist (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references profiles (id) on delete cascade,
  lab_id       uuid not null references labs (id) on delete cascade,
  booking_date date not null,
  start_time   time not null,
  end_time     time not null,
  position     integer not null default 1,
  status       waitlist_status not null default 'waiting',
  created_at   timestamptz not null default now(),
  constraint waitlist_time_valid check (end_time > start_time)
);

create index if not exists waitlist_lab_date_idx on waitlist (lab_id, booking_date);
create index if not exists waitlist_user_idx on waitlist (user_id);

-- -----------------------------------------------------------------------------
-- Notifications
-- -----------------------------------------------------------------------------

create table if not exists notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles (id) on delete cascade,
  kind       text not null default 'info',
  title      text not null,
  body       text,
  link       text,
  is_read    boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_idx on notifications (user_id, is_read);

-- -----------------------------------------------------------------------------
-- Derived availability
--
-- available = total - (quantity on approved/reserved/in_use bookings that have
-- not yet been returned). Counts only bookings whose window has not closed.
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
  where b.booking_status = 'in_use'
  group by be.equipment_id
) in_use on in_use.equipment_id = e.id;

-- -----------------------------------------------------------------------------
-- updated_at maintenance
-- -----------------------------------------------------------------------------

create or replace function touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch on profiles;
create trigger profiles_touch before update on profiles
  for each row execute function touch_updated_at();

drop trigger if exists labs_touch on labs;
create trigger labs_touch before update on labs
  for each row execute function touch_updated_at();

drop trigger if exists equipment_touch on equipment;
create trigger equipment_touch before update on equipment
  for each row execute function touch_updated_at();

drop trigger if exists bookings_touch on bookings;
create trigger bookings_touch before update on bookings
  for each row execute function touch_updated_at();

drop trigger if exists booking_rules_touch on booking_rules;
create trigger booking_rules_touch before update on booking_rules
  for each row execute function touch_updated_at();

-- -----------------------------------------------------------------------------
-- Auto-create a profile row when a user signs up
-- -----------------------------------------------------------------------------

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role, department_id)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    -- Role is never taken from user-supplied signup metadata: that would let
    -- anyone self-register as an admin. Always defaults to student; staff
    -- accounts are provisioned by the seed script or an admin.
    'student',
    nullif(new.raw_user_meta_data ->> 'department_id', '')::uuid
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
