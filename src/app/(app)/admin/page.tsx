import type { Metadata } from "next";
import Link from "next/link";
import { FlaskConical, LayoutGrid, Microscope, Plus, Settings2, SlidersHorizontal, Users } from "lucide-react";

import { ActionForm } from "@/components/action-form";
import { EmptyState } from "@/components/empty-state";
import { PageBody, PageHeader } from "@/components/page-header";
import { EQUIPMENT_CONDITION_TONES, ToneBadge, titleCase } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import {
  saveBookingRules,
  saveCategory,
  saveEquipment,
  saveLab,
  setEquipmentMaintenance,
  setLabStatus,
  setUserActive,
  setUserRole,
} from "@/lib/actions/admin";
import { COORDINATOR_ROLES, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Administration" };

const LAB_STATUSES = ["available", "reserved", "in_use", "maintenance", "closed"] as const;
const MAINTENANCE_STATUSES = ["operational", "needs_service", "under_maintenance", "out_of_service"] as const;
const CONDITIONS = ["new", "good", "fair", "damaged", "retired"] as const;
const ROLES = ["student", "faculty", "lab_staff", "coordinator", "admin"] as const;

const DEFAULT_RULES = {
  max_duration_minutes: 240,
  max_equipment_quantity: 10,
  advance_booking_days: 30,
  requires_approval: true,
  allow_student_booking: true,
};

export default async function AdminPage() {
  const profile = await requireRole(COORDINATOR_ROLES);
  const isAdmin = profile.role === "admin";
  const supabase = await createClient();

  const [{ data: departments }, { data: labs }, { data: equipment }, { data: categories }, { data: rules }] =
    await Promise.all([
      supabase.from("departments").select("id, name, code").order("name"),
      supabase.from("labs").select("id, name, code, status, capacity, department_id").order("name"),
      supabase
        .from("equipment")
        .select("id, name, asset_code, category_id, lab_id, total_quantity, condition, maintenance_status")
        .order("name")
        .limit(200),
      supabase.from("equipment_categories").select("id, name, requires_approval").order("name"),
      supabase.from("booking_rules").select("*"),
    ]);

  const users = isAdmin
    ? (
        await supabase
          .from("profiles")
          .select("id, full_name, email, role, is_active")
          .order("full_name")
          .limit(300)
      ).data
    : null;

  const departmentNames = new Map((departments ?? []).map((department) => [department.id, department.name]));
  const labNames = new Map((labs ?? []).map((lab) => [lab.id, lab.name]));
  const categoryNames = new Map((categories ?? []).map((category) => [category.id, category.name]));
  const rulesByDepartment = new Map((rules ?? []).map((rule) => [rule.department_id, rule]));

  return (
    <PageBody>
      <PageHeader
        title="Administration"
        description="Booking rules, labs, equipment and categories — the levers behind the workflow."
      />

      {/* ------------------------------------------------------- booking rules */}
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          <SlidersHorizontal className="size-3.5" aria-hidden />
          Booking rules per department
        </h2>
        <div className="grid gap-4 lg:grid-cols-2">
          {(departments ?? []).map((department) => {
            const rule = rulesByDepartment.get(department.id) ?? { department_id: department.id, ...DEFAULT_RULES };
            return (
              <Card key={department.id}>
                <CardHeader>
                  <CardTitle>{department.name}</CardTitle>
                  <CardDescription>{department.code}</CardDescription>
                </CardHeader>
                <CardContent>
                  <ActionForm action={saveBookingRules} submitLabel="Save rules">
                    <input type="hidden" name="departmentId" value={department.id} />
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Max duration (min)</Label>
                        <Input name="maxDurationMinutes" type="number" defaultValue={rule.max_duration_minutes} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Max equipment units</Label>
                        <Input name="maxEquipmentQuantity" type="number" defaultValue={rule.max_equipment_quantity} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Advance booking (days)</Label>
                        <Input name="advanceBookingDays" type="number" defaultValue={rule.advance_booking_days} />
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-4">
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" name="requiresApproval" defaultChecked={rule.requires_approval} />
                        Requires approval
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          name="allowStudentBooking"
                          defaultChecked={rule.allow_student_booking}
                        />
                        Students may book
                      </label>
                    </div>
                  </ActionForm>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      {/* ---------------------------------------------------------------- labs */}
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          <FlaskConical className="size-3.5" aria-hidden />
          Labs
        </h2>
        <Card>
          <CardContent className="space-y-2">
            {(labs ?? []).map((lab) => (
              <div
                key={lab.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-2.5 shadow-xs"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">{lab.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {lab.code} · {departmentNames.get(lab.department_id) ?? "Department"} · {lab.capacity} seats
                  </p>
                </div>
                <ActionForm
                  action={setLabStatus}
                  submitLabel="Update"
                  className="flex items-center gap-2 space-y-0"
                >
                  <input type="hidden" name="labId" value={lab.id} />
                  <NativeSelect name="status" defaultValue={lab.status} className="w-36" aria-label="Lab status">
                    {LAB_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {titleCase(status)}
                      </option>
                    ))}
                  </NativeSelect>
                </ActionForm>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="size-4 text-muted-foreground" aria-hidden />
              Add a lab
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ActionForm action={saveLab} submitLabel="Create lab">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1">
                  <Label className="text-xs">Name</Label>
                  <Input name="name" placeholder="Robotics Lab" required />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Code</Label>
                  <Input name="code" placeholder="CS-LAB-RBT" required />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Department</Label>
                  <NativeSelect name="departmentId" required>
                    {(departments ?? []).map((department) => (
                      <option key={department.id} value={department.id}>
                        {department.code}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Capacity</Label>
                  <Input name="capacity" type="number" min={0} defaultValue={20} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Location</Label>
                  <Input name="location" placeholder="Block A, Room 101" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Facilities (comma separated)</Label>
                  <Input name="facilities" placeholder="Projector, Whiteboard" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Opens</Label>
                  <Input name="openTime" type="time" defaultValue="08:00" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Closes</Label>
                  <Input name="closeTime" type="time" defaultValue="18:00" />
                </div>
              </div>
            </ActionForm>
          </CardContent>
        </Card>
      </section>

      {/* ----------------------------------------------------------- equipment */}
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          <Microscope className="size-3.5" aria-hidden />
          Equipment
        </h2>
        <Card>
          <CardContent className="space-y-2">
            {(equipment ?? []).map((item) => (
              <div
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-2.5 shadow-xs"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">{item.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.asset_code} · {categoryNames.get(item.category_id) ?? "Category"} ·{" "}
                    {item.lab_id ? (labNames.get(item.lab_id) ?? "Lab") : "No lab"} · {item.total_quantity} units
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <ToneBadge tone={EQUIPMENT_CONDITION_TONES[item.condition] ?? "neutral"}>
                    {titleCase(item.condition)}
                  </ToneBadge>
                  <ActionForm
                    action={setEquipmentMaintenance}
                    submitLabel="Update"
                    className="flex items-center gap-2 space-y-0"
                  >
                    <input type="hidden" name="equipmentId" value={item.id} />
                    <input type="hidden" name="condition" value={item.condition} />
                    <NativeSelect
                      name="maintenanceStatus"
                      defaultValue={item.maintenance_status}
                      className="w-40"
                      aria-label="Maintenance status"
                    >
                      {MAINTENANCE_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {titleCase(status)}
                        </option>
                      ))}
                    </NativeSelect>
                  </ActionForm>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="size-4 text-muted-foreground" aria-hidden />
              Add equipment
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ActionForm action={saveEquipment} submitLabel="Create equipment">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1">
                  <Label className="text-xs">Name</Label>
                  <Input name="name" placeholder="Arduino Uno Kit" required />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Asset code</Label>
                  <Input name="assetCode" placeholder="ARD-UNO-02" required />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Category</Label>
                  <NativeSelect name="categoryId" required>
                    {(categories ?? []).map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Home lab</Label>
                  <NativeSelect name="labId" defaultValue="">
                    <option value="">No lab</option>
                    {(labs ?? []).map((lab) => (
                      <option key={lab.id} value={lab.id}>
                        {lab.name}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Quantity</Label>
                  <Input name="totalQuantity" type="number" min={0} defaultValue={5} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Condition</Label>
                  <NativeSelect name="condition" defaultValue="good">
                    {CONDITIONS.map((condition) => (
                      <option key={condition} value={condition}>
                        {titleCase(condition)}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Maintenance</Label>
                  <NativeSelect name="maintenanceStatus" defaultValue="operational">
                    {MAINTENANCE_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {titleCase(status)}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              </div>
            </ActionForm>
          </CardContent>
        </Card>
      </section>

      {/* ---------------------------------------------------------- categories */}
      {isAdmin ? (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            <LayoutGrid className="size-3.5" aria-hidden />
            Equipment categories
          </h2>
          <Card>
            <CardContent className="space-y-2">
              {(categories ?? []).map((category) => (
                <div
                  key={category.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-2.5 text-sm shadow-xs"
                >
                  <span>{category.name}</span>
                  {category.requires_approval ? <ToneBadge tone="warning">Needs sign-off</ToneBadge> : null}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Plus className="size-4 text-muted-foreground" aria-hidden />
                Add a category
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ActionForm action={saveCategory} submitLabel="Create category">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Name</Label>
                    <Input name="name" placeholder="Drones" required />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <Label className="text-xs">Description</Label>
                    <Input name="description" placeholder="Quadcopters and spare batteries" />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="requiresApproval" />
                  Requires staff sign-off
                </label>
              </ActionForm>
            </CardContent>
          </Card>
        </section>
      ) : null}

      {/* --------------------------------------------------------------- users */}
      {isAdmin && users ? (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            <Users className="size-3.5" aria-hidden />
            Users
          </h2>
          {(users ?? []).length === 0 ? (
            <EmptyState icon={Settings2} title="No profiles found" description="Sign-ups appear here." />
          ) : (
            <Card>
              <CardContent className="space-y-2">
                {(users ?? []).map((user) => (
                  <div
                    key={user.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-2.5 shadow-xs"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{user.full_name || "Unnamed"}</p>
                      <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <ToneBadge tone={user.is_active ? "success" : "neutral"}>
                        {user.is_active ? "Active" : "Deactivated"}
                      </ToneBadge>
                      <ActionForm
                        action={setUserRole}
                        submitLabel="Save role"
                        className="flex items-center gap-2 space-y-0"
                      >
                        <input type="hidden" name="userId" value={user.id} />
                        <NativeSelect name="role" defaultValue={user.role} className="w-36" aria-label="Role">
                          {ROLES.map((role) => (
                            <option key={role} value={role}>
                              {titleCase(role)}
                            </option>
                          ))}
                        </NativeSelect>
                      </ActionForm>
                      <ActionForm
                        action={setUserActive}
                        submitLabel={user.is_active ? "Deactivate" : "Activate"}
                        variant={user.is_active ? "destructive" : "outline"}
                        className="space-y-0"
                      >
                        <input type="hidden" name="userId" value={user.id} />
                        <input type="hidden" name="isActive" value={user.is_active ? "false" : "true"} />
                      </ActionForm>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
          <p className="text-xs text-muted-foreground">
            Staff accounts are provisioned here or by the seed script — they can never be self-registered.{" "}
            <Button variant="link" size="xs" render={<Link href="/dashboard" />}>
              Back to dashboard
            </Button>
          </p>
        </section>
      ) : null}
    </PageBody>
  );
}
