import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CalendarCheck2, CalendarClock, ChevronRight, CircleAlert, ClipboardCheck, FlaskConical, PackageCheck, Plus, TriangleAlert } from "lucide-react";

import { BookingRow } from "@/components/booking-row";
import { EmptyState } from "@/components/empty-state";
import { PageBody, PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { addDays } from "@/lib/booking/availability";
import type { BookingStatus } from "@/lib/booking/status";
import { COORDINATOR_ROLES, STAFF_ROLES, requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { titleCase } from "@/components/status-badge";

const TONE_ICON = {
  default: "text-muted-foreground",
  positive: "text-success",
  warning: "text-warning",
  danger: "text-destructive",
} as const;

const TONE_VALUE = {
  default: "text-foreground",
  positive: "text-success",
  warning: "text-warning",
  danger: "text-destructive",
} as const;

export const metadata: Metadata = { title: "Dashboard" };

const QUICK_ACTIONS = [
  { href: "/bookings/new", label: "New booking", icon: Plus },
  { href: "/labs", label: "Browse labs", icon: FlaskConical },
  { href: "/equipment", label: "Browse equipment", icon: PackageCheck },
  { href: "/waitlist", label: "My waitlist", icon: CalendarClock },
] as const;

type Supabase = Awaited<ReturnType<typeof createClient>>;

type DashboardRow = {
  id: string;
  requester: string;
  title: string;
  date: string;
  start: string;
  end: string;
  status: BookingStatus;
  meta?: string;
};

async function labNameMap(supabase: Supabase, ids: string[]) {
  if (ids.length === 0) return new Map<string, string>();
  const { data } = await supabase.from("labs").select("id, name").in("id", ids);
  return new Map((data ?? []).map((lab) => [lab.id, lab.name]));
}

async function equipmentNameMap(supabase: Supabase, ids: string[]) {
  if (ids.length === 0) return new Map<string, string>();
  const { data } = await supabase.from("equipment").select("id, name").in("id", ids);
  return new Map((data ?? []).map((item) => [item.id, item.name]));
}

async function requesterNameMap(supabase: Supabase, ids: string[]) {
  if (ids.length === 0) return new Map<string, string>();
  const { data } = await supabase.from("profiles").select("id, full_name").in("id", ids);
  return new Map((data ?? []).map((profile) => [profile.id, profile.full_name]));
}

export default async function DashboardPage() {
  const profile = await requireUser();
  const supabase = await createClient();

  const today = new Date().toISOString().slice(0, 10);
  const isStaff = STAFF_ROLES.includes(profile.role);
  const isCoordinator = COORDINATOR_ROLES.includes(profile.role);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const firstName = profile.full_name.split(" ")[0] || "there";

  // -------------------------------------------------------------- staff view
  let pendingQueue: DashboardRow[] = [];
  let todaySchedule: DashboardRow[] = [];
  let overdue: Array<{ id: string; bookingId: string; equipment: string; dueAt: string; quantity: number }> = [];
  let pendingCount = 0;
  let inUseCount = 0;
  let overdueCount = 0;
  let todayCount = 0;

  // ------------------------------------------------------------ student view
  let upcoming: DashboardRow[] = [];
  let myTotal = 0;
  let myPending = 0;
  let myActive = 0;
  let myCompleted = 0;

  if (isStaff) {
    const [queueRes, todayRes, overdueRes, pendingRes, activeRes, overdueCountRes, todayCountRes] =
      await Promise.all([
        supabase
          .from("bookings")
          .select("id, user_id, resource_type, lab_id, booking_date, start_time, end_time, purpose, priority_reason")
          .eq("booking_status", "pending_approval")
          .order("priority_score", { ascending: false })
          .order("booking_date", { ascending: true })
          .limit(5),
        supabase
          .from("bookings")
          .select("id, user_id, resource_type, lab_id, booking_date, start_time, end_time, purpose, priority_reason")
          .eq("booking_date", today)
          .in("booking_status", ["approved", "reserved", "in_use"])
          .order("start_time", { ascending: true })
          .limit(6),
        supabase
          .from("issues")
          .select("id, booking_id, equipment_id, quantity, due_at")
          .is("returned_at", null)
          .lt("due_at", new Date().toISOString())
          .order("due_at", { ascending: true })
          .limit(5),
        supabase.from("bookings").select("id", { count: "exact", head: true }).eq("booking_status", "pending_approval"),
        supabase
          .from("bookings")
          .select("id", { count: "exact", head: true })
          .in("booking_status", ["approved", "reserved", "in_use"]),
        supabase
          .from("issues")
          .select("id", { count: "exact", head: true })
          .is("returned_at", null)
          .lt("due_at", new Date().toISOString()),
        supabase
          .from("bookings")
          .select("id", { count: "exact", head: true })
          .eq("booking_date", today)
          .in("booking_status", ["approved", "reserved", "in_use"]),
      ]);

    pendingCount = pendingRes.count ?? 0;
    inUseCount = activeRes.count ?? 0;
    overdueCount = overdueCountRes.count ?? 0;
    todayCount = todayCountRes.count ?? 0;

    const queueRows = queueRes.data ?? [];
    const queueLabIds = Array.from(
      new Set(queueRows.map((row) => row.lab_id).filter((id): id is string => id !== null)),
    );
    const queueLabs = await labNameMap(supabase, queueLabIds);
    const queueRequesters = await requesterNameMap(
      supabase,
      Array.from(new Set(queueRows.map((row) => row.user_id))),
    );

    pendingQueue = queueRows.map((row) => ({
      id: row.id,
      requester: queueRequesters.get(row.user_id) ?? "Requester",
      title:
        row.resource_type === "lab" && row.lab_id
          ? (queueLabs.get(row.lab_id) ?? "Lab booking")
          : "Equipment request",
      date: row.booking_date,
      start: row.start_time,
      end: row.end_time,
      status: "pending_approval",
      meta: row.priority_reason ?? undefined,
    }));

    const todayRows = todayRes.data ?? [];
    const todayLabIds = Array.from(
      new Set(todayRows.map((row) => row.lab_id).filter((id): id is string => id !== null)),
    );
    const todayLabs = await labNameMap(supabase, todayLabIds);
    const todayRequesters = await requesterNameMap(
      supabase,
      Array.from(new Set(todayRows.map((row) => row.user_id))),
    );

    todaySchedule = todayRows.map((row) => ({
      id: row.id,
      requester: todayRequesters.get(row.user_id) ?? "Requester",
      title:
        row.resource_type === "lab" && row.lab_id
          ? (todayLabs.get(row.lab_id) ?? "Lab booking")
          : "Equipment request",
      date: row.booking_date,
      start: row.start_time,
      end: row.end_time,
      status: "reserved",
      meta: row.purpose.slice(0, 60),
    }));

    const overdueRows = overdueRes.data ?? [];
    const overdueEquipment = await equipmentNameMap(
      supabase,
      Array.from(new Set(overdueRows.map((row) => row.equipment_id))),
    );

    overdue = overdueRows.map((row) => ({
      id: row.id,
      bookingId: row.booking_id,
      equipment: overdueEquipment.get(row.equipment_id) ?? "Equipment",
      dueAt: row.due_at ?? "",
      quantity: row.quantity,
    }));
  } else {
    const [upcomingRes, totalRes, pendingRes, activeRes, completedRes] = await Promise.all([
      supabase
        .from("bookings")
        .select("id, resource_type, lab_id, booking_date, start_time, end_time, purpose, booking_status")
        .eq("user_id", profile.id)
        .in("booking_status", ["pending_approval", "approved", "reserved", "in_use", "overdue"])
        .gte("booking_date", today)
        .order("booking_date", { ascending: true })
        .order("start_time", { ascending: true })
        .limit(5),
      supabase.from("bookings").select("id", { count: "exact", head: true }).eq("user_id", profile.id),
      supabase
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .eq("user_id", profile.id)
        .eq("booking_status", "pending_approval"),
      supabase
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .eq("user_id", profile.id)
        .in("booking_status", ["approved", "reserved", "in_use"]),
      supabase
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .eq("user_id", profile.id)
        .eq("booking_status", "completed"),
    ]);

    myTotal = totalRes.count ?? 0;
    myPending = pendingRes.count ?? 0;
    myActive = activeRes.count ?? 0;
    myCompleted = completedRes.count ?? 0;

    const rows = upcomingRes.data ?? [];
    const names = await labNameMap(
      supabase,
      Array.from(new Set(rows.map((row) => row.lab_id).filter((id): id is string => id !== null))),
    );

    upcoming = rows.map((row) => ({
      id: row.id,
      requester: profile.full_name,
      title:
        row.resource_type === "lab" && row.lab_id
          ? (names.get(row.lab_id) ?? "Lab booking")
          : "Equipment request",
      date: row.booking_date,
      start: row.start_time,
      end: row.end_time,
      status: row.booking_status,
      meta: row.purpose.slice(0, 60),
    }));
  }

  // ------------------------------------------------------ coordinator extras
  let mostBooked: Array<{ name: string; count: number }> = [];
  let damageCount = 0;

  if (isCoordinator) {
    const [{ data: recent }, { count }] = await Promise.all([
      supabase
        .from("bookings")
        .select("lab_id")
        .gte("booking_date", addDays(today, -30))
        .not("lab_id", "is", null),
      supabase
        .from("issues")
        .select("id", { count: "exact", head: true })
        .in("return_condition", ["damaged", "missing_parts"]),
    ]);

    damageCount = count ?? 0;

    const counts = new Map<string, number>();
    for (const row of recent ?? []) {
      if (!row.lab_id) continue;
      counts.set(row.lab_id, (counts.get(row.lab_id) ?? 0) + 1);
    }

    const top = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4);
    const names = await labNameMap(supabase, top.map(([id]) => id));
    mostBooked = top.map(([id, count]) => ({ name: names.get(id) ?? "Lab", count }));
  }

  const stats = isStaff
    ? [
        {
          label: "Pending requests",
          value: pendingCount,
          icon: ClipboardCheck,
          tone: pendingCount > 0 ? ("warning" as const) : ("default" as const),
          hint: pendingCount > 0 ? "Waiting for a decision" : "Queue is clear",
        },
        {
          label: "Active bookings",
          value: inUseCount,
          icon: CalendarCheck2,
          tone: "default" as const,
          hint: "Approved, reserved or in use",
        },
        {
          label: "Overdue returns",
          value: overdueCount,
          icon: TriangleAlert,
          tone: overdueCount > 0 ? ("danger" as const) : ("default" as const),
          hint: overdueCount > 0 ? "Chase these up" : "Nothing overdue",
        },
        {
          label: "Bookings today",
          value: todayCount,
          icon: CalendarClock,
          tone: "default" as const,
          hint: "On today's schedule",
        },
      ]
    : [
        {
          label: "Total bookings",
          value: myTotal,
          icon: CalendarCheck2,
          tone: "default" as const,
          hint: "All time",
        },
        {
          label: "Awaiting review",
          value: myPending,
          icon: ClipboardCheck,
          tone: myPending > 0 ? ("warning" as const) : ("default" as const),
          hint: "With lab staff",
        },
        {
          label: "Active",
          value: myActive,
          icon: CalendarClock,
          tone: "default" as const,
          hint: "Approved or in use",
        },
        {
          label: "Completed",
          value: myCompleted,
          icon: CalendarCheck2,
          tone: "positive" as const,
          hint: "Finished sessions",
        },
      ];

  return (
    <PageBody className="relative isolate">
      {/* Mesh behind the hero strip so the one glass surface has depth. */}
      <div aria-hidden className="bg-mesh pointer-events-none absolute -inset-x-4 -top-4 -z-10 h-64 lg:-inset-x-8 lg:-top-8" />
      <PageHeader
        title={`${greeting}, ${firstName}`}
        description={
          isStaff
            ? `Signed in as ${titleCase(profile.role)} — here is what needs attention.`
            : "Your bookings and requests at a glance."
        }
        actions={
          <>
            {isStaff ? (
              <Button variant="outline" size="sm" render={<Link href="/approvals" />}>
                <ClipboardCheck className="size-4" aria-hidden />
                Approvals
              </Button>
            ) : null}
            <Button size="sm" render={<Link href="/bookings/new" />}>
              <Plus className="size-4" aria-hidden />
              New booking
            </Button>
          </>
        }
      />

      <div className="glass rounded-2xl border p-1.5">
        <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-xl px-4 py-3.5 transition-colors hover:bg-card/60">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-medium text-muted-foreground">{stat.label}</p>
                <stat.icon className={cn("size-4 shrink-0", TONE_ICON[stat.tone])} aria-hidden />
              </div>
              <p
                className={cn(
                  "mt-1.5 text-2xl font-semibold tracking-tight tabular-nums",
                  TONE_VALUE[stat.tone],
                )}
              >
                {stat.value}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">{stat.hint}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        {isStaff ? (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ClipboardCheck className="size-4 text-muted-foreground" aria-hidden />
                  Approval queue
                </CardTitle>
                <CardDescription>Highest priority first.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {pendingQueue.length === 0 ? (
                  <EmptyState
                    icon={ClipboardCheck}
                    title="No pending requests"
                    description="New requests from students and faculty will land here."
                  />
                ) : (
                  pendingQueue.map((row) => (
                    <BookingRow
                      key={row.id}
                      id={row.id}
                      title={`${row.title} — ${row.requester}`}
                      date={row.date}
                      start={row.start}
                      end={row.end}
                      status={row.status}
                      meta={row.meta}
                      today={today}
                    />
                  ))
                )}
                <Button variant="ghost" size="sm" className="w-full" render={<Link href="/approvals" />}>
                  Open the queue <ArrowRight className="size-3.5" aria-hidden />
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CalendarClock className="size-4 text-muted-foreground" aria-hidden />
                  Today&apos;s schedule
                </CardTitle>
                <CardDescription>Approved bookings happening today.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {todaySchedule.length === 0 ? (
                  <EmptyState
                    icon={CalendarClock}
                    title="Nothing scheduled today"
                    description="Approved bookings for today will appear here."
                  />
                ) : (
                  todaySchedule.map((row) => (
                    <BookingRow
                      key={row.id}
                      id={row.id}
                      title={`${row.title} — ${row.requester}`}
                      date={row.date}
                      start={row.start}
                      end={row.end}
                      status={row.status}
                      meta={row.meta}
                      today={today}
                    />
                  ))
                )}
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <PackageCheck className="size-4 text-muted-foreground" aria-hidden />
                  Overdue returns
                </CardTitle>
                <CardDescription>Equipment past its due date.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {overdue.length === 0 ? (
                  <EmptyState
                    icon={PackageCheck}
                    title="Nothing overdue"
                    description="Issued equipment that passes its due time will show up here."
                  />
                ) : (
                  overdue.map((row) => (
                    <Link
                      key={row.id}
                      href={`/bookings/${row.bookingId}`}
                      className="flex items-center justify-between gap-3 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 transition-colors hover:bg-destructive/10"
                    >
                      <div>
                        <p className="text-sm font-medium">
                          {row.equipment} × {row.quantity}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Due {formatDateTime(row.dueAt)}
                        </p>
                      </div>
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive">
                        <CircleAlert className="size-3.5" aria-hidden />
                        Overdue
                      </span>
                    </Link>
                  ))
                )}
              </CardContent>
            </Card>
          </>
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FlaskConical className="size-4 text-muted-foreground" aria-hidden />
                  Upcoming bookings
                </CardTitle>
                <CardDescription>Requests and reservations ahead of you.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {upcoming.length === 0 ? (
                  <EmptyState
                    icon={FlaskConical}
                    title="No upcoming bookings"
                    description="Browse a lab and request a slot — it takes a minute."
                    action={
                      <Button size="sm" render={<Link href="/labs" />}>
                        Browse labs
                      </Button>
                    }
                  />
                ) : (
                  upcoming.map((row) => (
                    <BookingRow
                      key={row.id}
                      id={row.id}
                      title={row.title}
                      date={row.date}
                      start={row.start}
                      end={row.end}
                      status={row.status}
                      meta={row.meta}
                      today={today}
                    />
                  ))
                )}
                <Button variant="ghost" size="sm" className="w-full" render={<Link href="/bookings" />}>
                  All my bookings <ArrowRight className="size-3.5" aria-hidden />
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Quick actions</CardTitle>
                <CardDescription>The usual next steps.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-2 sm:grid-cols-2">
                {QUICK_ACTIONS.map((action) => (
                  <Link
                    key={action.href}
                    href={action.href}
                    className="group flex items-center gap-3 rounded-xl border border-border bg-card p-3 transition-colors duration-150 hover:border-primary/30 hover:bg-accent/40"
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <action.icon className="size-4" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{action.label}</span>
                    <ChevronRight
                      className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 group-hover:translate-x-0.5"
                      aria-hidden
                    />
                  </Link>
                ))}
              </CardContent>
            </Card>
          </>
        )}

        {isCoordinator ? (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Resource usage — last 30 days</CardTitle>
              <CardDescription>
                Most booked labs and damage reports, from actual booking history.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-6 sm:grid-cols-2">
                <div className="space-y-3">
                  {mostBooked.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No bookings in the last 30 days.</p>
                  ) : (
                    mostBooked.map((lab, index) => {
                      const max = mostBooked[0]?.count ?? 1;
                      return (
                        <div key={lab.name} className="flex items-center gap-3">
                          <span className="w-4 shrink-0 text-xs tabular-nums text-muted-foreground">
                            {index + 1}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-sm">{lab.name}</span>
                          <span className="h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-muted">
                            <span
                              className="block h-full rounded-full bg-primary"
                              style={{ width: `${Math.round((lab.count / Math.max(max, 1)) * 100)}%` }}
                            />
                          </span>
                          <span className="w-6 shrink-0 text-right text-sm font-medium tabular-nums">
                            {lab.count}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
                <div className="rounded-lg border bg-muted/30 p-4">
                  <p className="text-sm text-muted-foreground">Damage reports</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums">{damageCount}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Returns recorded as damaged or missing parts.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </PageBody>
  );
}
