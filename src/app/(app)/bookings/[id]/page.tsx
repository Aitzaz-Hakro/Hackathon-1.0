import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarRange, ArrowLeft, Clock, PackageCheck, QrCode, Settings2 } from "lucide-react";

import { CancelBookingForm, DecisionActions, IssueBookingButton } from "@/components/booking-actions";
import { PageBody, PageHeader } from "@/components/page-header";
import { ApprovalBadge, StatusBadge, titleCase } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { StatusTone } from "@/lib/booking/status";
import { isStaffRole, requireUser } from "@/lib/auth";
import { formatDateTime, formatDay, formatTimeRange } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Booking" };

const CANCELABLE = ["draft", "pending_approval", "approved", "reserved"];

const DOT_CLASSES: Record<StatusTone, string> = {
  neutral: "bg-muted-foreground/50",
  info: "bg-info",
  violet: "bg-violet",
  warning: "bg-warning",
  success: "bg-success",
  danger: "bg-destructive",
};

export default async function BookingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await requireUser();
  const { id } = await params;
  const supabase = await createClient();

  const { data: booking } = await supabase.from("bookings").select("*").eq("id", id).maybeSingle();
  if (!booking) notFound();

  const isOwner = booking.user_id === profile.id;
  const staff = isStaffRole(profile.role);

  const [{ data: lab }, { data: lines }, { data: issues }] = await Promise.all([
    booking.lab_id
      ? supabase.from("labs").select("id, name, code, location").eq("id", booking.lab_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("booking_equipment").select("equipment_id, quantity").eq("booking_id", booking.id),
    supabase
      .from("issues")
      .select("id, equipment_id, quantity, checkout_code, issued_at, due_at, returned_at, return_condition")
      .eq("booking_id", booking.id)
      .order("created_at"),
  ]);

  const equipmentIds = [
    ...new Set([
      ...(lines ?? []).map((line) => line.equipment_id),
      ...(issues ?? []).map((issue) => issue.equipment_id),
    ]),
  ];
  const equipmentNames =
    equipmentIds.length > 0
      ? new Map(
          ((await supabase.from("equipment").select("id, name").in("id", equipmentIds)).data ?? []).map(
            (item) => [item.id, item.name],
          ),
        )
      : new Map<string, string>();

  let requesterName: string | null = null;
  if (staff && !isOwner) {
    const { data: requester } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", booking.user_id)
      .maybeSingle();
    requesterName = requester?.full_name ?? null;
  }

  const issuedAt = (issues ?? [])
    .map((issue) => issue.issued_at)
    .filter((value): value is string => value !== null)
    .sort()[0];

  const events: Array<{ label: string; at: string | null; detail?: string | null; tone: StatusTone }> = [
    { label: "Requested", at: booking.created_at, tone: "neutral" },
  ];
  if (booking.rejection_reason) {
    events.push({ label: "Rejected", at: null, detail: booking.rejection_reason, tone: "danger" });
  }
  if (booking.approved_at) {
    events.push({ label: "Approved", at: booking.approved_at, tone: "success" });
  }
  if (issuedAt) {
    events.push({ label: "Issued / access granted", at: issuedAt, tone: "info" });
  }
  if (booking.cancelled_at) {
    events.push({ label: "Cancelled", at: booking.cancelled_at, detail: booking.cancel_reason, tone: "neutral" });
  }
  if (booking.completed_at) {
    events.push({ label: "Completed", at: booking.completed_at, tone: "success" });
  }

  const canCancel = CANCELABLE.includes(booking.booking_status) && (isOwner || staff);
  const canDecide = staff && booking.booking_status === "pending_approval";
  const canIssue =
    staff && (booking.booking_status === "approved" || booking.booking_status === "reserved");

  return (
    <PageBody>
      <div>
        <Button variant="ghost" size="sm" className="-ml-2 mb-2 text-muted-foreground" render={<Link href="/bookings" />}>
          <ArrowLeft className="size-3.5" aria-hidden />
          My bookings
        </Button>
        <PageHeader
          title={lab ? lab.name : "Equipment request"}
          description={`${formatDay(booking.booking_date)} · ${formatTimeRange(booking.start_time, booking.end_time)}${lab ? ` · ${lab.code}` : ""}`}
          actions={
            <>
              <ApprovalBadge status={booking.approval_status} />
              <StatusBadge status={booking.booking_status} />
            </>
          }
        />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarRange className="size-4 text-muted-foreground" aria-hidden />
                Request details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div>
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Purpose</p>
                <p className="mt-1">{booking.purpose}</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Date</p>
                  <p className="mt-1">{formatDay(booking.booking_date)}</p>
                </div>
                <div>
                  <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Time</p>
                  <p className="mt-1">{formatTimeRange(booking.start_time, booking.end_time)}</p>
                </div>
                <div>
                  <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Attendees</p>
                  <p className="mt-1">{booking.expected_attendees ?? "—"}</p>
                </div>
              </div>

              {lab ? (
                <div>
                  <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Lab</p>
                  <p className="mt-1">
                    <Link href={`/labs/${lab.id}`} className="text-primary hover:underline">
                      {lab.name} ({lab.code})
                    </Link>
                    {lab.location ? ` · ${lab.location}` : ""}
                  </p>
                </div>
              ) : null}

              {requesterName ? (
                <div>
                  <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Requested by</p>
                  <p className="mt-1">{requesterName}</p>
                </div>
              ) : null}

              {booking.priority_reason ? (
                <div>
                  <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    Priority ({booking.priority_score}/100)
                  </p>
                  <p className="mt-1 text-muted-foreground">{booking.priority_reason}</p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {(lines ?? []).length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <PackageCheck className="size-4 text-muted-foreground" aria-hidden />
                  Equipment
                </CardTitle>
                <CardDescription>Reserved for this booking.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {(lines ?? []).map((line) => (
                  <div key={line.equipment_id} className="flex items-center justify-between gap-3 text-sm">
                    <Link href={`/equipment/${line.equipment_id}`} className="hover:underline">
                      {equipmentNames.get(line.equipment_id) ?? "Item"}
                    </Link>
                    <span className="text-muted-foreground">× {line.quantity}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}

          {(issues ?? []).length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <QrCode className="size-4 text-muted-foreground" aria-hidden />
                  Custody
                </CardTitle>
                <CardDescription>Checkout codes and return state.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {(issues ?? []).map((issue) => (
                  <div
                    key={issue.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2.5 text-sm"
                  >
                    <div>
                      <p className="font-medium">
                        {equipmentNames.get(issue.equipment_id) ?? "Item"} × {issue.quantity}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {issue.returned_at
                          ? `Returned ${formatDateTime(issue.returned_at)}`
                          : issue.due_at
                            ? `Due ${formatDateTime(issue.due_at)}`
                            : "Not issued yet"}
                        {issue.return_condition ? ` · ${titleCase(issue.return_condition)}` : ""}
                      </p>
                    </div>
                    <span className="flex items-center gap-2">
                      <code className="rounded-md border bg-muted px-2 py-0.5 font-mono text-xs">
                        {issue.checkout_code}
                      </code>
                      <Link href={`/scan?code=${issue.checkout_code}`} className="text-primary hover:underline">
                        <QrCode className="size-4" aria-hidden />
                      </Link>
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="size-4 text-muted-foreground" aria-hidden />
                Status timeline
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-4">
                {events.map((event, index) => (
                  <li key={`${event.label}-${index}`} className="flex gap-3">
                    <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", DOT_CLASSES[event.tone])} aria-hidden />
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{event.label}</p>
                      {event.at ? (
                        <p className="text-xs text-muted-foreground">{formatDateTime(event.at)}</p>
                      ) : null}
                      {event.detail ? (
                        <p className="mt-0.5 text-xs text-muted-foreground">{event.detail}</p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>

          {canDecide || canIssue || canCancel ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings2 className="size-4 text-muted-foreground" aria-hidden />
                  Actions
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {canDecide ? <DecisionActions bookingId={booking.id} /> : null}
                {canIssue ? <IssueBookingButton bookingId={booking.id} /> : null}
                {canCancel ? <CancelBookingForm bookingId={booking.id} /> : null}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </PageBody>
  );
}
