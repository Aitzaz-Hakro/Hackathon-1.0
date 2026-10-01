/**
 * Hand-written Supabase schema types.
 *
 * Normally these are produced by `supabase gen types typescript`, but that
 * requires the Supabase CLI, which is not installed in this environment. They
 * are maintained by hand against `supabase/migrations/` and must be updated
 * whenever a migration changes a column.
 *
 * Row types match a `select('*')` result. `Insert` makes database defaults
 * optional; `Update` is a partial row.
 */

import type { BookingStatus, StatusTone } from "./booking/status";

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

/** Row -> Insert: the listed keys become optional because the database fills them. */
type InsertOf<Row, Optional extends keyof Row> = Omit<Row, Optional> & Partial<Pick<Row, Optional>>;

// -----------------------------------------------------------------------------
// Enums — must match the `create type` statements in 0001_schema.sql
// -----------------------------------------------------------------------------

export type UserRole = "student" | "faculty" | "lab_staff" | "coordinator" | "admin";
export type LabStatus = "available" | "reserved" | "in_use" | "maintenance" | "closed";
export type EquipmentCondition = "new" | "good" | "fair" | "damaged" | "retired";
export type MaintenanceStatus = "operational" | "needs_service" | "under_maintenance" | "out_of_service";
export type ResourceType = "lab" | "equipment";
export type ApprovalStatus = "pending" | "approved" | "rejected";
export type ReturnCondition = "good" | "fair" | "damaged" | "missing_parts" | "not_returned";
export type WaitlistStatus = "waiting" | "promoted" | "expired" | "cancelled";

/** Re-exported from the state machine so both live in one place. */
export type { BookingStatus, StatusTone };

// -----------------------------------------------------------------------------
// Row shapes
// -----------------------------------------------------------------------------

export type DepartmentRow = {
  id: string;
  name: string;
  code: string;
  head_name: string | null;
  created_at: string;
};

export type ProfileRow = {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  department_id: string | null;
  student_id: string | null;
  phone: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type LabRow = {
  id: string;
  name: string;
  code: string;
  department_id: string;
  capacity: number;
  location: string;
  facilities: string[];
  open_time: string;
  close_time: string;
  status: LabStatus;
  description: string | null;
  created_at: string;
  updated_at: string;
};

export type EquipmentCategoryRow = {
  id: string;
  name: string;
  description: string | null;
  requires_approval: boolean;
  created_at: string;
};

export type EquipmentRow = {
  id: string;
  name: string;
  asset_code: string;
  category_id: string;
  lab_id: string | null;
  total_quantity: number;
  condition: EquipmentCondition;
  maintenance_status: MaintenanceStatus;
  damage_count: number;
  description: string | null;
  created_at: string;
  updated_at: string;
};

export type BookingRow = {
  id: string;
  user_id: string;
  resource_type: ResourceType;
  lab_id: string | null;
  booking_date: string;
  start_time: string;
  end_time: string;
  purpose: string;
  expected_attendees: number | null;
  approval_status: ApprovalStatus;
  booking_status: BookingStatus;
  priority_score: number;
  priority_reason: string | null;
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type BookingEquipmentRow = {
  id: string;
  booking_id: string;
  equipment_id: string;
  quantity: number;
  created_at: string;
};

export type IssueRow = {
  id: string;
  booking_id: string;
  equipment_id: string;
  quantity: number;
  issued_at: string | null;
  due_at: string | null;
  returned_at: string | null;
  return_condition: ReturnCondition | null;
  remarks: string | null;
  damage_image_url: string | null;
  issued_by: string | null;
  received_by: string | null;
  checkout_code: string;
  created_at: string;
};

export type BookingRuleRow = {
  id: string;
  department_id: string;
  max_duration_minutes: number;
  max_equipment_quantity: number;
  advance_booking_days: number;
  requires_approval: boolean;
  allow_student_booking: boolean;
  created_at: string;
  updated_at: string;
};

export type WaitlistRow = {
  id: string;
  user_id: string;
  lab_id: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  position: number;
  status: WaitlistStatus;
  created_at: string;
};

export type NotificationRow = {
  id: string;
  user_id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
};

// -----------------------------------------------------------------------------
// Derived view
// -----------------------------------------------------------------------------

export type EquipmentAvailabilityRow = {
  equipment_id: string;
  name: string;
  asset_code: string;
  category_id: string;
  lab_id: string | null;
  total_quantity: number;
  reserved_quantity: number;
  in_use_quantity: number;
  available_quantity: number;
  condition: EquipmentCondition;
  maintenance_status: MaintenanceStatus;
  damage_count: number;
};

/**
 * Occupancy intervals from `lab_busy_slots` (0005). Intervals only — no user,
 * purpose or booking id — so it is safe to read for any authenticated user.
 */
export type LabBusySlotRow = {
  lab_id: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  booking_status: BookingStatus;
};

// -----------------------------------------------------------------------------
// Database
// -----------------------------------------------------------------------------

export type Database = {
  public: {
    Tables: {
      departments: {
        Row: DepartmentRow;
        Insert: InsertOf<DepartmentRow, "id" | "created_at" | "head_name">;
        Update: Partial<DepartmentRow>;
        Relationships: [];
      };
      profiles: {
        Row: ProfileRow;
        // `role`, `is_active` and `department_id` are not user-settable; a
        // trigger reverts them on self-update. See 0002_rls.sql.
        Insert: InsertOf<
          ProfileRow,
          "created_at" | "updated_at" | "role" | "is_active" | "full_name" | "department_id" | "student_id" | "phone"
        >;
        Update: Partial<ProfileRow>;
        Relationships: [];
      };
      labs: {
        Row: LabRow;
        Insert: InsertOf<
          LabRow,
          | "id"
          | "created_at"
          | "updated_at"
          | "capacity"
          | "location"
          | "facilities"
          | "open_time"
          | "close_time"
          | "status"
          | "description"
        >;
        Update: Partial<LabRow>;
        Relationships: [];
      };
      equipment_categories: {
        Row: EquipmentCategoryRow;
        Insert: InsertOf<EquipmentCategoryRow, "id" | "created_at" | "description" | "requires_approval">;
        Update: Partial<EquipmentCategoryRow>;
        Relationships: [];
      };
      equipment: {
        Row: EquipmentRow;
        Insert: InsertOf<
          EquipmentRow,
          | "id"
          | "created_at"
          | "updated_at"
          | "lab_id"
          | "total_quantity"
          | "condition"
          | "maintenance_status"
          | "damage_count"
          | "description"
        >;
        Update: Partial<EquipmentRow>;
        Relationships: [];
      };
      bookings: {
        Row: BookingRow;
        Insert: InsertOf<
          BookingRow,
          | "id"
          | "created_at"
          | "updated_at"
          | "approval_status"
          | "booking_status"
          | "priority_score"
          | "priority_reason"
          | "lab_id"
          | "expected_attendees"
          | "approved_by"
          | "approved_at"
          | "rejection_reason"
          | "cancelled_at"
          | "cancel_reason"
          | "completed_at"
        >;
        Update: Partial<BookingRow>;
        Relationships: [];
      };
      booking_equipment: {
        Row: BookingEquipmentRow;
        Insert: InsertOf<BookingEquipmentRow, "id" | "created_at">;
        Update: Partial<BookingEquipmentRow>;
        Relationships: [];
      };
      issues: {
        Row: IssueRow;
        Insert: InsertOf<
          IssueRow,
          | "id"
          | "created_at"
          | "issued_at"
          | "due_at"
          | "returned_at"
          | "return_condition"
          | "remarks"
          | "damage_image_url"
          | "issued_by"
          | "received_by"
        >;
        Update: Partial<IssueRow>;
        Relationships: [];
      };
      booking_rules: {
        Row: BookingRuleRow;
        Insert: InsertOf<
          BookingRuleRow,
          | "id"
          | "created_at"
          | "updated_at"
          | "max_duration_minutes"
          | "max_equipment_quantity"
          | "advance_booking_days"
          | "requires_approval"
          | "allow_student_booking"
        >;
        Update: Partial<BookingRuleRow>;
        Relationships: [];
      };
      waitlist: {
        Row: WaitlistRow;
        Insert: InsertOf<WaitlistRow, "id" | "created_at" | "position" | "status">;
        Update: Partial<WaitlistRow>;
        Relationships: [];
      };
      notifications: {
        Row: NotificationRow;
        // Inserts go through the `notify_user` RPC — there is no INSERT policy
        // on this table. See 0002_rls.sql.
        Insert: InsertOf<NotificationRow, "id" | "created_at" | "is_read" | "kind" | "body" | "link">;
        Update: Partial<NotificationRow>;
        Relationships: [];
      };
    };
    Views: {
      equipment_availability: {
        Row: EquipmentAvailabilityRow;
        Relationships: [];
      };
      lab_busy_slots: {
        Row: LabBusySlotRow;
        Relationships: [];
      };
    };
    Functions: {
      auth_role: { Args: Record<string, never>; Returns: UserRole };
      auth_department: { Args: Record<string, never>; Returns: string };
      is_staff: { Args: Record<string, never>; Returns: boolean };
      is_coordinator: { Args: Record<string, never>; Returns: boolean };
      is_admin: { Args: Record<string, never>; Returns: boolean };
      can_manage_lab: { Args: { target_lab: string }; Returns: boolean };
      is_conflict_error: { Args: { err_msg: string }; Returns: boolean };
      notify_user: {
        Args: {
          target_user: string;
          n_title: string;
          n_body?: string;
          n_link?: string;
          n_kind?: string;
        };
        Returns: undefined;
      };
      promote_waitlist: {
        Args: {
          p_lab: string;
          p_date: string;
          p_start: string;
          p_end: string;
        };
        Returns: string | null;
      };
      waitlist_position: {
        Args: {
          p_lab: string;
          p_date: string;
          p_start: string;
          p_end: string;
        };
        Returns: number;
      };
    };
    Enums: {
      user_role: UserRole;
      lab_status: LabStatus;
      equipment_condition: EquipmentCondition;
      maintenance_status: MaintenanceStatus;
      resource_type: ResourceType;
      approval_status: ApprovalStatus;
      booking_status: BookingStatus;
      return_condition: ReturnCondition;
      waitlist_status: WaitlistStatus;
    };
    CompositeTypes: Record<never, never>;
  };
};

// -----------------------------------------------------------------------------
// Convenience aliases
// -----------------------------------------------------------------------------

export type Profile = ProfileRow;
export type Lab = LabRow;
export type Equipment = EquipmentRow;
export type EquipmentAvailability = EquipmentAvailabilityRow;
export type Booking = BookingRow;
export type BookingEquipment = BookingEquipmentRow;
export type Issue = IssueRow;
export type BookingRule = BookingRuleRow;
export type WaitlistEntry = WaitlistRow;
export type Notification = NotificationRow;
export type Department = DepartmentRow;
export type EquipmentCategory = EquipmentCategoryRow;
