"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { COORDINATOR_ROLES, STAFF_ROLES, assertRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { dbErrorMessage, fail, ok, toActionFailure, type ActionResult } from "./shared";

const ADMIN_ROLES = ["admin"] as const;

const DATE_TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function checkbox(formData: FormData, name: string): boolean {
  const value = formData.get(name);
  return value === "on" || value === "true";
}

function revalidateCatalog(): void {
  revalidatePath("/admin");
  revalidatePath("/labs");
  revalidatePath("/equipment");
}

// -----------------------------------------------------------------------------
// Labs
// -----------------------------------------------------------------------------

const labSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2, "Give the lab a name.").max(120),
  code: z.string().trim().min(2, "Give the lab a code.").max(30),
  departmentId: z.string().uuid(),
  capacity: z.coerce.number().int().min(0).max(1000),
  location: z.string().trim().max(120).catch(""),
  facilities: z.string().max(500).catch(""),
  openTime: z.string().regex(DATE_TIME_RE, "Use HH:MM."),
  closeTime: z.string().regex(DATE_TIME_RE, "Use HH:MM."),
  description: z.string().trim().max(500).optional(),
});

export async function saveLab(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await assertRole(STAFF_ROLES);

    const parsed = labSchema.safeParse({
      id: formData.get("id") || undefined,
      name: formData.get("name"),
      code: formData.get("code"),
      departmentId: formData.get("departmentId"),
      capacity: formData.get("capacity"),
      location: formData.get("location"),
      facilities: formData.get("facilities"),
      openTime: formData.get("openTime"),
      closeTime: formData.get("closeTime"),
      description: formData.get("description") || undefined,
    });

    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Check the lab details.", "validation");
    }

    if (parsed.data.closeTime <= parsed.data.openTime) {
      return fail("Closing time must be after opening time.", "validation");
    }

    const payload = {
      name: parsed.data.name,
      code: parsed.data.code,
      department_id: parsed.data.departmentId,
      capacity: parsed.data.capacity,
      location: parsed.data.location,
      facilities: parsed.data.facilities
        .split(",")
        .map((facility) => facility.trim())
        .filter(Boolean),
      open_time: parsed.data.openTime,
      close_time: parsed.data.closeTime,
      description: parsed.data.description ?? null,
    };

    const supabase = await createClient();
    const { error } = parsed.data.id
      ? await supabase.from("labs").update(payload).eq("id", parsed.data.id)
      : await supabase.from("labs").insert(payload);

    if (error) return fail(dbErrorMessage(error, "Could not save the lab."));

    revalidateCatalog();
    return ok(undefined, parsed.data.id ? "Lab updated." : "Lab created.");
  } catch (error) {
    return toActionFailure(error, "Could not save the lab.");
  }
}

export async function setLabStatus(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await assertRole(STAFF_ROLES);

    const parsed = z
      .object({
        labId: z.string().uuid(),
        status: z.enum(["available", "reserved", "in_use", "maintenance", "closed"]),
      })
      .safeParse({ labId: formData.get("labId"), status: formData.get("status") });

    if (!parsed.success) return fail("That update was malformed.", "validation");

    const supabase = await createClient();
    const { error } = await supabase
      .from("labs")
      .update({ status: parsed.data.status })
      .eq("id", parsed.data.labId);

    if (error) return fail(dbErrorMessage(error, "Could not update the lab status."));

    revalidateCatalog();
    revalidatePath(`/labs/${parsed.data.labId}`);
    return ok(undefined, "Lab status updated.");
  } catch (error) {
    return toActionFailure(error, "Could not update the lab status.");
  }
}

// -----------------------------------------------------------------------------
// Equipment
// -----------------------------------------------------------------------------

const equipmentSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2, "Give the item a name.").max(120),
  assetCode: z.string().trim().min(2, "Give the item an asset code.").max(40),
  categoryId: z.string().uuid(),
  labId: z.string().uuid().nullable().catch(null),
  totalQuantity: z.coerce.number().int().min(0).max(10_000),
  condition: z.enum(["new", "good", "fair", "damaged", "retired"]),
  maintenanceStatus: z.enum(["operational", "needs_service", "under_maintenance", "out_of_service"]),
  description: z.string().trim().max(500).optional(),
});

export async function saveEquipment(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await assertRole(STAFF_ROLES);

    const parsed = equipmentSchema.safeParse({
      id: formData.get("id") || undefined,
      name: formData.get("name"),
      assetCode: formData.get("assetCode"),
      categoryId: formData.get("categoryId"),
      labId: formData.get("labId") || null,
      totalQuantity: formData.get("totalQuantity"),
      condition: formData.get("condition"),
      maintenanceStatus: formData.get("maintenanceStatus"),
      description: formData.get("description") || undefined,
    });

    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Check the equipment details.", "validation");
    }

    const payload = {
      name: parsed.data.name,
      asset_code: parsed.data.assetCode,
      category_id: parsed.data.categoryId,
      lab_id: parsed.data.labId,
      total_quantity: parsed.data.totalQuantity,
      condition: parsed.data.condition,
      maintenance_status: parsed.data.maintenanceStatus,
      description: parsed.data.description ?? null,
    };

    const supabase = await createClient();
    const { error } = parsed.data.id
      ? await supabase.from("equipment").update(payload).eq("id", parsed.data.id)
      : await supabase.from("equipment").insert(payload);

    if (error) return fail(dbErrorMessage(error, "Could not save the equipment."));

    revalidateCatalog();
    return ok(undefined, parsed.data.id ? "Equipment updated." : "Equipment added.");
  } catch (error) {
    return toActionFailure(error, "Could not save the equipment.");
  }
}

export async function setEquipmentMaintenance(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await assertRole(STAFF_ROLES);

    const parsed = z
      .object({
        equipmentId: z.string().uuid(),
        maintenanceStatus: z.enum(["operational", "needs_service", "under_maintenance", "out_of_service"]),
        condition: z.enum(["new", "good", "fair", "damaged", "retired"]).optional(),
      })
      .safeParse({
        equipmentId: formData.get("equipmentId"),
        maintenanceStatus: formData.get("maintenanceStatus"),
        condition: formData.get("condition") || undefined,
      });

    if (!parsed.success) return fail("That update was malformed.", "validation");

    const supabase = await createClient();
    const { error } = await supabase
      .from("equipment")
      .update({
        maintenance_status: parsed.data.maintenanceStatus,
        ...(parsed.data.condition ? { condition: parsed.data.condition } : {}),
      })
      .eq("id", parsed.data.equipmentId);

    if (error) return fail(dbErrorMessage(error, "Could not update the equipment."));

    revalidateCatalog();
    revalidatePath(`/equipment/${parsed.data.equipmentId}`);
    return ok(undefined, "Equipment status updated.");
  } catch (error) {
    return toActionFailure(error, "Could not update the equipment.");
  }
}

// -----------------------------------------------------------------------------
// Categories
// -----------------------------------------------------------------------------

export async function saveCategory(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await assertRole(ADMIN_ROLES);

    const parsed = z
      .object({
        id: z.string().uuid().optional(),
        name: z.string().trim().min(2, "Give the category a name.").max(80),
        description: z.string().trim().max(300).optional(),
        requiresApproval: z.boolean(),
      })
      .safeParse({
        id: formData.get("id") || undefined,
        name: formData.get("name"),
        description: formData.get("description") || undefined,
        requiresApproval: checkbox(formData, "requiresApproval"),
      });

    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Check the category details.", "validation");
    }

    const payload = {
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      requires_approval: parsed.data.requiresApproval,
    };

    const supabase = await createClient();
    const { error } = parsed.data.id
      ? await supabase.from("equipment_categories").update(payload).eq("id", parsed.data.id)
      : await supabase.from("equipment_categories").insert(payload);

    if (error) return fail(dbErrorMessage(error, "Could not save the category."));

    revalidateCatalog();
    return ok(undefined, parsed.data.id ? "Category updated." : "Category created.");
  } catch (error) {
    return toActionFailure(error, "Could not save the category.");
  }
}

// -----------------------------------------------------------------------------
// Booking rules
// -----------------------------------------------------------------------------

export async function saveBookingRules(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await assertRole(COORDINATOR_ROLES);

    const parsed = z
      .object({
        departmentId: z.string().uuid(),
        maxDurationMinutes: z.coerce.number().int().min(30).max(1440),
        maxEquipmentQuantity: z.coerce.number().int().min(1).max(1000),
        advanceBookingDays: z.coerce.number().int().min(1).max(365),
        requiresApproval: z.boolean(),
        allowStudentBooking: z.boolean(),
      })
      .safeParse({
        departmentId: formData.get("departmentId"),
        maxDurationMinutes: formData.get("maxDurationMinutes"),
        maxEquipmentQuantity: formData.get("maxEquipmentQuantity"),
        advanceBookingDays: formData.get("advanceBookingDays"),
        requiresApproval: checkbox(formData, "requiresApproval"),
        allowStudentBooking: checkbox(formData, "allowStudentBooking"),
      });

    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Check the rule values.", "validation");
    }

    const supabase = await createClient();
    const { error } = await supabase.from("booking_rules").upsert(
      {
        department_id: parsed.data.departmentId,
        max_duration_minutes: parsed.data.maxDurationMinutes,
        max_equipment_quantity: parsed.data.maxEquipmentQuantity,
        advance_booking_days: parsed.data.advanceBookingDays,
        requires_approval: parsed.data.requiresApproval,
        allow_student_booking: parsed.data.allowStudentBooking,
      },
      { onConflict: "department_id" },
    );

    if (error) return fail(dbErrorMessage(error, "Could not save the rules."));

    revalidatePath("/admin");
    return ok(undefined, "Booking rules saved.");
  } catch (error) {
    return toActionFailure(error, "Could not save the rules.");
  }
}

// -----------------------------------------------------------------------------
// Users
// -----------------------------------------------------------------------------

export async function setUserRole(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await assertRole(ADMIN_ROLES);

    const parsed = z
      .object({
        userId: z.string().uuid(),
        role: z.enum(["student", "faculty", "lab_staff", "coordinator", "admin"]),
      })
      .safeParse({ userId: formData.get("userId"), role: formData.get("role") });

    if (!parsed.success) return fail("That update was malformed.", "validation");

    const supabase = await createClient();
    const { error } = await supabase
      .from("profiles")
      .update({ role: parsed.data.role })
      .eq("id", parsed.data.userId);

    if (error) return fail(dbErrorMessage(error, "Could not change the role."));

    revalidatePath("/admin");
    return ok(undefined, "Role updated.");
  } catch (error) {
    return toActionFailure(error, "Could not change the role.");
  }
}

export async function setUserActive(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await assertRole(ADMIN_ROLES);

    const parsed = z
      .object({ userId: z.string().uuid(), isActive: z.boolean() })
      .safeParse({ userId: formData.get("userId"), isActive: checkbox(formData, "isActive") });

    if (!parsed.success) return fail("That update was malformed.", "validation");

    const supabase = await createClient();
    const { error } = await supabase
      .from("profiles")
      .update({ is_active: parsed.data.isActive })
      .eq("id", parsed.data.userId);

    if (error) return fail(dbErrorMessage(error, "Could not update the account."));

    revalidatePath("/admin");
    return ok(undefined, parsed.data.isActive ? "Account activated." : "Account deactivated.");
  } catch (error) {
    return toActionFailure(error, "Could not update the account.");
  }
}
