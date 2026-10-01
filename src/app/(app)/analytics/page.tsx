import type { Metadata } from "next";
import {
  BarChart3,
  Boxes,
  CalendarCheck2,
  CalendarRange,
  CalendarX2,
  Clock,
  FlaskConical,
  Inbox,
  Landmark,
  Microscope,
  TriangleAlert,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import { PeakHoursChart } from "@/components/charts/peak-hours-chart";
import { EmptyState } from "@/components/empty-state";
import { PageBody, PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { UsageHeatmap } from "@/components/usage-heatmap";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { addDays } from "@/lib/booking/availability";
import { COORDINATOR_ROLES, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Analytics" };

const HEATMAP_HOURS = Array.from({ length: 14 }, (_, index) => index + 8);

const MINI_ICON_CLASSES = {
  default: "bg-muted text-muted-foreground",
  positive: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  danger: "bg-destructive/10 text-destructive",
} as const;

const MINI_VALUE_CLASSES = {
  default: "text-foreground",
  positive: "text-success",
  warning: "text-warning",
  danger: "text-destructive",
} as const;

function MiniStat({
  label,
  value,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: number | string;
  icon: LucideIcon;
  tone?: keyof typeof MINI_ICON_CLASSES;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-xs">
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-lg",
          MINI_ICON_CLASSES[tone],
        )}
      >
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="truncate text-xs text-muted-foreground">{label}</p>
        <p className={cn("text-lg font-semibold tracking-tight tabular-nums", MINI_VALUE_CLASSES[tone])}>
          {value}
        </p>
      </div>
    </div>
  );
}

export default async function AnalyticsPage() {
  await requireRole(COORDINATOR_ROLES);
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const nowIso = new Date().toISOString();
  const window30 = addDays(today, -30);

  const [{ data: bookings }, { data: issues }, { data: labs }, { data: departments }] = await Promise.all([
    supabase
      .from("bookings")
      .select("id, booking_date, start_time, booking_status, approval_status, lab_id, resource_type")
      .limit(3000),
    supabase
      .from("issues")
      .select("equipment_id, quantity, return_condition, returned_at, due_at")
      .limit(2000),
    supabase.from("labs").select("id, name, department_id"),
    supabase.from("departments").select("id, name"),
  ]);

  const allBookings = bookings ?? [];
  const allIssues = issues ?? [];
  const labRows = labs ?? [];
  const departmentRows = departments ?? [];
  const recent = allBookings.filter((booking) => booking.booking_date >= window30);

  const labNames = new Map(labRows.map((lab) => [lab.id, lab.name]));
  const departmentNames = new Map(departmentRows.map((department) => [department.id, department.name]));
  const labDepartment = new Map(labRows.map((lab) => [lab.id, lab.department_id]));

  // ------------------------------------------------------------------- KPIs
  const total = allBookings.length;
  const approved = allBookings.filter((booking) => booking.approval_status === "approved").length;
  const pending = allBookings.filter((booking) => booking.booking_status === "pending_approval").length;
  const cancelled = allBookings.filter(
    (booking) => booking.booking_status === "cancelled" || booking.booking_status === "rejected",
  ).length;
  const outNow = allIssues.filter((issue) => issue.returned_at === null);
  const overdue = outNow.filter((issue) => issue.due_at !== null && issue.due_at < nowIso).length;
  const damageReports = allIssues.filter(
    (issue) => issue.return_condition === "damaged" || issue.return_condition === "missing_parts",
  ).length;

  // --------------------------------------------------------------- heatmap
  const matrix = Array.from({ length: 7 }, () => HEATMAP_HOURS.map(() => 0));
  for (const booking of allBookings) {
    const date = new Date(`${booking.booking_date}T00:00:00Z`);
    const dayIndex = (date.getUTCDay() + 6) % 7; // Monday first
    const hour = Number(booking.start_time.slice(0, 2));
    const hourIndex = HEATMAP_HOURS.indexOf(hour);
    if (hourIndex >= 0) matrix[dayIndex][hourIndex] += 1;
  }
  const heatMax = Math.max(1, ...matrix.flat());

  const peakHours = HEATMAP_HOURS.map((hour) => ({
    hour: `${hour}:00`,
    bookings: allBookings.filter((booking) => Number(booking.start_time.slice(0, 2)) === hour).length,
  }));

  // ----------------------------------------------------------- lab rankings
  const recentByLab = new Map<string, number>();
  for (const booking of recent) {
    if (!booking.lab_id) continue;
    recentByLab.set(booking.lab_id, (recentByLab.get(booking.lab_id) ?? 0) + 1);
  }

  const mostBooked = Array.from(recentByLab.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([labId, count]) => ({ name: labNames.get(labId) ?? "Lab", count }));

  const underused = labRows
    .map((lab) => ({ name: lab.name, count: recentByLab.get(lab.id) ?? 0 }))
    .sort((a, b) => a.count - b.count)
    .slice(0, 4);

  // ------------------------------------------------------ equipment ranking
  const equipmentTotals = new Map<string, number>();
  for (const issue of allIssues) {
    equipmentTotals.set(issue.equipment_id, (equipmentTotals.get(issue.equipment_id) ?? 0) + issue.quantity);
  }

  const equipmentIds = Array.from(equipmentTotals.keys());
  const equipmentNames =
    equipmentIds.length > 0
      ? new Map(
          ((await supabase.from("equipment").select("id, name").in("id", equipmentIds)).data ?? []).map(
            (item) => [item.id, item.name],
          ),
        )
      : new Map<string, string>();

  const mostUsedEquipment = Array.from(equipmentTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([equipmentId, quantity]) => ({
      name: equipmentNames.get(equipmentId) ?? "Item",
      quantity,
    }));

  // -------------------------------------------------------- department usage
  const departmentTotals = new Map<string, number>();
  for (const booking of recent) {
    if (!booking.lab_id) continue;
    const departmentId = labDepartment.get(booking.lab_id);
    const name = departmentId ? (departmentNames.get(departmentId) ?? "Unknown") : "Unknown";
    departmentTotals.set(name, (departmentTotals.get(name) ?? 0) + 1);
  }

  const byDepartment = Array.from(departmentTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  return (
    <PageBody>
      <PageHeader
        title="Analytics"
        description="Usage across every lab, department and equipment category — from real booking history."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total bookings" value={total} icon={CalendarCheck2} hint="All recorded history" />
        <StatCard label="Approved" value={approved} icon={BarChart3} tone="positive" hint="Cleared by staff" />
        <StatCard
          label="Pending"
          value={pending}
          icon={Inbox}
          tone={pending > 0 ? "warning" : "default"}
          hint={pending > 0 ? "Awaiting a decision" : "Queue is clear"}
        />
        <StatCard label="Cancelled / rejected" value={cancelled} icon={CalendarX2} hint="Did not go ahead" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MiniStat label="Equipment out" value={outNow.length} icon={Boxes} />
        <MiniStat label="Overdue" value={overdue} icon={TriangleAlert} tone={overdue > 0 ? "danger" : "default"} />
        <MiniStat
          label="Damage reports"
          value={damageReports}
          icon={Wrench}
          tone={damageReports > 0 ? "warning" : "default"}
        />
        <MiniStat label="Active labs" value={labRows.length} icon={FlaskConical} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarRange className="size-4 text-muted-foreground" aria-hidden />
            When labs get used
          </CardTitle>
          <CardDescription>Bookings by weekday and start hour, all recorded history.</CardDescription>
        </CardHeader>
        <CardContent>
          <UsageHeatmap matrix={matrix} hours={HEATMAP_HOURS} max={heatMax} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="size-4 text-muted-foreground" aria-hidden />
            Peak booking hours
          </CardTitle>
          <CardDescription>Requests by hour of day.</CardDescription>
        </CardHeader>
        <CardContent>
          <PeakHoursChart data={peakHours} />
        </CardContent>
      </Card>

      <div className="grid items-start gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FlaskConical className="size-4 text-muted-foreground" aria-hidden />
              Most booked labs
            </CardTitle>
            <CardDescription>Last 30 days.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {mostBooked.length === 0 ? (
              <EmptyState title="No bookings yet" description="Data appears as bookings are made." />
            ) : (
              mostBooked.map((lab, index) => (
                <div key={lab.name} className="flex items-center gap-3">
                  <span className="w-4 shrink-0 text-xs tabular-nums text-muted-foreground">{index + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-sm">{lab.name}</span>
                  <span className="h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-muted">
                    <span
                      className="block h-full rounded-full bg-primary"
                      style={{
                        width: `${Math.round((lab.count / Math.max(mostBooked[0]?.count ?? 1, 1)) * 100)}%`,
                      }}
                    />
                  </span>
                  <span className="w-6 shrink-0 text-right text-sm font-medium tabular-nums">{lab.count}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Microscope className="size-4 text-muted-foreground" aria-hidden />
              Most used equipment
            </CardTitle>
            <CardDescription>Units issued, all time.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {mostUsedEquipment.length === 0 ? (
              <EmptyState title="No equipment issued yet" description="Issue something from the desk to populate this." />
            ) : (
              mostUsedEquipment.map((item, index) => (
                <div key={item.name} className="flex items-center gap-3">
                  <span className="w-4 shrink-0 text-xs tabular-nums text-muted-foreground">{index + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-sm">{item.name}</span>
                  <span className="h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-muted">
                    <span
                      className="block h-full rounded-full bg-primary"
                      style={{
                        width: `${Math.round((item.quantity / Math.max(mostUsedEquipment[0]?.quantity ?? 1, 1)) * 100)}%`,
                      }}
                    />
                  </span>
                  <span className="w-6 shrink-0 text-right text-sm font-medium tabular-nums">{item.quantity}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="size-4 text-muted-foreground" aria-hidden />
              Underused labs
            </CardTitle>
            <CardDescription>Last 30 days — candidates for promotion.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {underused.map((lab) => (
              <div key={lab.name} className="flex items-center gap-3">
                <span className="min-w-0 flex-1 truncate text-sm">{lab.name}</span>
                <span className="h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-muted">
                  <span
                    className="block h-full rounded-full bg-muted-foreground/40"
                    style={{
                      width: `${Math.round((lab.count / Math.max(underused[0]?.count ?? 1, 1)) * 100)}%`,
                    }}
                  />
                </span>
                <span className="w-6 shrink-0 text-right text-sm font-medium tabular-nums text-muted-foreground">
                  {lab.count}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Landmark className="size-4 text-muted-foreground" aria-hidden />
            Usage by department
          </CardTitle>
          <CardDescription>Bookings on each department&apos;s labs, last 30 days.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {byDepartment.length === 0 ? (
            <EmptyState title="No department activity yet" description="Bookings roll up here by lab department." />
          ) : (
            byDepartment.map(([name, count]) => {
              const width = Math.round((count / Math.max(byDepartment[0][1], 1)) * 100);
              return (
                <div key={name} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span>{name}</span>
                    <span className="tabular-nums font-medium">{count}</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${width}%` }} />
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </PageBody>
  );
}
