import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, PackageCheck, TriangleAlert } from "lucide-react";

import { IssueBookingButton } from "@/components/booking-actions";
import { EmptyState } from "@/components/empty-state";
import { PageBody, PageHeader } from "@/components/page-header";
import { ReturnForm } from "@/components/return-form";
import { StatCard } from "@/components/stat-card";
import { ToneBadge } from "@/components/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { STAFF_ROLES, requireRole } from "@/lib/auth";
import { formatDateTime, formatDay, formatTimeRange } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Issues & returns" };

export default async function IssuesPage() {
  await requireRole(STAFF_ROLES);
  const supabase = await createClient();
  const now = new Date().toISOString();

  const [{ data: openIssues }, { data: readyBookings }] = await Promise.all([
    supabase
      .from("issues")
      .select("id, booking_id, equipment_id, quantity, checkout_code, issued_at, due_at")
      .is("returned_at", null)
      .order("due_at", { ascending: true })
      .limit(100),
    supabase
      .from("bookings")
      .select("id, user_id, resource_type, lab_id, booking_date, start_time, end_time, purpose")
      .in("booking_status", ["approved", "reserved"])
      .order("booking_date", { ascending: true })
      .order("start_time", { ascending: true })
      .limit(50),
  ]);

  const issues = openIssues ?? [];
  const bookings = readyBookings ?? [];

  const equipmentIds = Array.from(
    new Set([...issues.map((issue) => issue.equipment_id)]),
  );
  const bookingIds = Array.from(new Set([...issues.map((issue) => issue.booking_id), ...bookings.map((b) => b.id)]));
  const labIds = Array.from(new Set(bookings.map((b) => b.lab_id).filter((id): id is string => id !== null)));
  const userIds = Array.from(new Set(bookings.map((b) => b.user_id)));

  const [equipmentResult, bookingResult, labResult, profileResult] = await Promise.all([
    equipmentIds.length > 0
      ? supabase.from("equipment").select("id, name").in("id", equipmentIds)
      : Promise.resolve({ data: [] }),
    bookingIds.length > 0
      ? supabase.from("bookings").select("id, booking_date, start_time, end_time").in("id", bookingIds)
      : Promise.resolve({ data: [] }),
    labIds.length > 0 ? supabase.from("labs").select("id, name").in("id", labIds) : Promise.resolve({ data: [] }),
    userIds.length > 0
      ? supabase.from("profiles").select("id, full_name").in("id", userIds)
      : Promise.resolve({ data: [] }),
  ]);

  const equipmentNames = new Map((equipmentResult.data ?? []).map((item) => [item.id, item.name]));
  const bookingsById = new Map((bookingResult.data ?? []).map((booking) => [booking.id, booking]));
  const labNames = new Map((labResult.data ?? []).map((lab) => [lab.id, lab.name]));
  const requesterNames = new Map((profileResult.data ?? []).map((profile) => [profile.id, profile.full_name]));

  const overdue = issues.filter((issue) => issue.due_at !== null && issue.due_at < now);

  return (
    <PageBody>
      <PageHeader
        title="Issues & returns"
        description="Hand out equipment, record returns, and chase anything overdue."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Outstanding items" value={issues.length} icon={PackageCheck} />
        <StatCard
          label="Overdue"
          value={overdue.length}
          icon={TriangleAlert}
          tone={overdue.length > 0 ? "danger" : "default"}
        />
        <StatCard label="Ready to issue" value={bookings.length} icon={CalendarClock} hint="Approved, not yet handed out" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PackageCheck className="size-4 text-muted-foreground" aria-hidden />
            Outstanding
          </CardTitle>
          <CardDescription>Equipped items that have not been returned yet.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {issues.length === 0 ? (
            <EmptyState
              icon={PackageCheck}
              title="Nothing checked out"
              description="Issued equipment appears here until it is returned."
            />
          ) : (
            issues.map((issue) => {
              const booking = bookingsById.get(issue.booking_id);
              const isOverdue = issue.due_at !== null && issue.due_at < now;

              return (
                <div key={issue.id} className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-xs">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">
                        {equipmentNames.get(issue.equipment_id) ?? "Item"} × {issue.quantity}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {booking
                          ? `${formatDay(booking.booking_date)} · ${formatTimeRange(booking.start_time, booking.end_time)}`
                          : "Booking unavailable"}{" "}
                        · code <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">{issue.checkout_code}</code>
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {isOverdue ? <ToneBadge tone="danger" icon={TriangleAlert}>Overdue</ToneBadge> : null}
                      {issue.due_at ? (
                        <span className="text-xs text-muted-foreground">Due {formatDateTime(issue.due_at)}</span>
                      ) : null}
                      <Link href={`/bookings/${issue.booking_id}`} className="text-xs font-medium text-primary hover:underline">
                        Booking
                      </Link>
                    </div>
                  </div>
                  <div className="border-t border-border pt-3">
                    <ReturnForm issueId={issue.id} />
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarClock className="size-4 text-muted-foreground" aria-hidden />
            Ready to issue
          </CardTitle>
          <CardDescription>Approved bookings waiting for checkout or lab access.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {bookings.length === 0 ? (
            <EmptyState
              icon={CalendarClock}
              title="Nothing to hand out"
              description="Approved bookings appear here so you can issue equipment or grant access."
            />
          ) : (
            bookings.map((booking) => (
              <div
                key={booking.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-xs transition-colors duration-150 hover:border-primary/30"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {booking.resource_type === "lab" && booking.lab_id
                      ? (labNames.get(booking.lab_id) ?? "Lab booking")
                      : "Equipment request"}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {requesterNames.get(booking.user_id) ?? "Requester"} ·{" "}
                    {formatDay(booking.booking_date)} · {formatTimeRange(booking.start_time, booking.end_time)} ·{" "}
                    {booking.purpose.slice(0, 50)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Link href={`/bookings/${booking.id}`} className="text-xs text-primary hover:underline">
                    View
                  </Link>
                  <IssueBookingButton bookingId={booking.id} />
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </PageBody>
  );
}
