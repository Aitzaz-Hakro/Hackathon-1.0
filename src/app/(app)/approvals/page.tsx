import type { Metadata } from "next";
import Link from "next/link";
import { CircleDot, Clock, Inbox, TriangleAlert, type LucideIcon } from "lucide-react";

import { DecisionActions } from "@/components/booking-actions";
import { EmptyState } from "@/components/empty-state";
import { PageBody, PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { StatusBadge, ToneBadge } from "@/components/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { PRIORITY_LABELS } from "@/lib/booking/priority";
import { STAFF_ROLES, requireRole } from "@/lib/auth";
import { formatDay, formatTimeRange } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Approvals" };

const PRIORITY_ICONS: Record<string, LucideIcon> = {
  high: TriangleAlert,
  medium: Clock,
  normal: CircleDot,
};

function initials(name: string): string {
  return (
    name
      .split(" ")
      .map((part) => part.charAt(0))
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"
  );
}

export default async function ApprovalsPage() {
  await requireRole(STAFF_ROLES);
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data: bookings } = await supabase
    .from("bookings")
    .select("id, user_id, resource_type, lab_id, booking_date, start_time, end_time, purpose, expected_attendees, priority_score, priority_reason")
    .eq("booking_status", "pending_approval")
    .order("priority_score", { ascending: false })
    .order("booking_date", { ascending: true })
    .limit(50);

  const rows = bookings ?? [];
  const bookingIds = rows.map((row) => row.id);
  const labIds = Array.from(new Set(rows.map((row) => row.lab_id).filter((id): id is string => id !== null)));
  const userIds = Array.from(new Set(rows.map((row) => row.user_id)));

  const [labResult, profileResult, lineResult] = await Promise.all([
    labIds.length > 0 ? supabase.from("labs").select("id, name").in("id", labIds) : Promise.resolve({ data: [] }),
    userIds.length > 0
      ? supabase.from("profiles").select("id, full_name").in("id", userIds)
      : Promise.resolve({ data: [] }),
    bookingIds.length > 0
      ? supabase.from("booking_equipment").select("booking_id, equipment_id, quantity").in("booking_id", bookingIds)
      : Promise.resolve({ data: [] }),
  ]);

  const labNames = new Map((labResult.data ?? []).map((lab) => [lab.id, lab.name]));
  const requesterNames = new Map((profileResult.data ?? []).map((profile) => [profile.id, profile.full_name]));
  const lines = lineResult.data ?? [];

  const equipmentIds = Array.from(new Set(lines.map((line) => line.equipment_id)));
  const equipmentNames =
    equipmentIds.length > 0
      ? new Map(
          ((await supabase.from("equipment").select("id, name").in("id", equipmentIds)).data ?? []).map(
            (item) => [item.id, item.name],
          ),
        )
      : new Map<string, string>();

  const linesByBooking = new Map<string, Array<{ name: string; quantity: number }>>();
  for (const line of lines) {
    const list = linesByBooking.get(line.booking_id) ?? [];
    list.push({ name: equipmentNames.get(line.equipment_id) ?? "Item", quantity: line.quantity });
    linesByBooking.set(line.booking_id, list);
  }

  const highPriority = rows.filter((row) => row.priority_score >= 70).length;
  const todayRequests = rows.filter((row) => row.booking_date === today).length;

  return (
    <PageBody>
      <PageHeader
        title="Approvals"
        description="Every pending request, highest priority first. Approving reserves the slot immediately."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Pending requests" value={rows.length} icon={Inbox} tone={rows.length > 0 ? "warning" : "default"} />
        <StatCard label="High priority" value={highPriority} hint="Score 70 or above" />
        <StatCard label="Needed today" value={todayRequests} />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="Queue is clear"
          description="Nothing is waiting for a decision. New requests will appear here."
        />
      ) : (
        <div className="space-y-3">
          {rows.map((booking) => {
            const band = booking.priority_score >= 70 ? "high" : booking.priority_score >= 40 ? "medium" : "normal";
            const bookingLines = linesByBooking.get(booking.id) ?? [];

            return (
              <Card key={booking.id} className="transition-colors duration-150 hover:border-primary/30">
                <CardContent className="space-y-3">
                  <div className="flex items-start gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                      {initials(requesterNames.get(booking.user_id) ?? "Requester")}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">
                          {booking.resource_type === "lab" && booking.lab_id
                            ? (labNames.get(booking.lab_id) ?? "Lab booking")
                            : "Equipment request"}
                        </p>
                        <StatusBadge status="pending_approval" />
                        <ToneBadge
                          tone={band === "high" ? "danger" : band === "medium" ? "warning" : "neutral"}
                          icon={PRIORITY_ICONS[band]}
                        >
                          {PRIORITY_LABELS[band]}
                        </ToneBadge>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {requesterNames.get(booking.user_id) ?? "Requester"} ·{" "}
                        <Link href={`/bookings/${booking.id}`} className="hover:underline">
                          {formatDay(booking.booking_date)} · {formatTimeRange(booking.start_time, booking.end_time)}
                        </Link>
                        {booking.expected_attendees ? ` · ${booking.expected_attendees} attendees` : ""}
                      </p>
                    </div>
                    <Link
                      href={`/bookings/${booking.id}`}
                      className="shrink-0 text-xs font-medium text-primary hover:underline"
                    >
                      View
                    </Link>
                  </div>

                  <div className="space-y-1">
                    <p className="line-clamp-2 text-sm">{booking.purpose}</p>
                    {bookingLines.length > 0 ? (
                      <p className="text-xs text-muted-foreground">
                        Equipment: {bookingLines.map((line) => `${line.name} × ${line.quantity}`).join(", ")}
                      </p>
                    ) : null}
                    {booking.priority_reason ? (
                      <p className="text-xs text-muted-foreground">{booking.priority_reason}</p>
                    ) : null}
                  </div>

                  <div className="border-t border-border pt-3">
                    <DecisionActions bookingId={booking.id} />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Priority scores combine role (faculty requests rank higher), urgency, purpose keywords and request scope.
      </p>
    </PageBody>
  );
}
