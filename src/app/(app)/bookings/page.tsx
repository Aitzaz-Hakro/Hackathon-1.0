import type { Metadata } from "next";
import Link from "next/link";

import { BookingRow } from "@/components/booking-row";
import { EmptyState } from "@/components/empty-state";
import { PageBody, PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import type { BookingStatus } from "@/lib/booking/status";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "My bookings" };

const FILTERS = [
  { value: "all", label: "All" },
  { value: "upcoming", label: "Upcoming" },
  { value: "pending", label: "Awaiting review" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
] as const;

function matchesFilter(filter: string, status: BookingStatus, date: string, today: string): boolean {
  switch (filter) {
    case "upcoming":
      return (
        date >= today &&
        ["pending_approval", "approved", "reserved", "in_use", "overdue"].includes(status)
      );
    case "pending":
      return status === "pending_approval";
    case "completed":
      return ["completed", "returned_late", "damaged"].includes(status);
    case "cancelled":
      return status === "cancelled" || status === "rejected";
    default:
      return true;
  }
}

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const profile = await requireUser();
  const params = await searchParams;
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const filter = FILTERS.some((entry) => entry.value === params.status) ? (params.status as string) : "all";

  const { data: bookings } = await supabase
    .from("bookings")
    .select("id, resource_type, lab_id, booking_date, start_time, end_time, purpose, booking_status")
    .eq("user_id", profile.id)
    .order("booking_date", { ascending: false })
    .order("start_time", { ascending: false })
    .limit(200);

  const rows = bookings ?? [];
  const labIds = Array.from(new Set(rows.map((row) => row.lab_id).filter((id): id is string => id !== null)));
  const labNames =
    labIds.length > 0
      ? new Map(
          ((await supabase.from("labs").select("id, name").in("id", labIds)).data ?? []).map((lab) => [
            lab.id,
            lab.name,
          ]),
        )
      : new Map<string, string>();

  const filtered = rows.filter((row) => matchesFilter(filter, row.booking_status, row.booking_date, today));

  return (
    <PageBody>
      <PageHeader
        title="My bookings"
        description="Every request you have submitted, newest first."
        actions={
          <Button size="sm" render={<Link href="/bookings/new" />}>
            New booking
          </Button>
        }
      />

      <nav aria-label="Booking filters" className="-mb-px flex flex-wrap gap-1 border-b border-border">
        {FILTERS.map((entry) => {
          const count = rows.filter((row) =>
            matchesFilter(entry.value, row.booking_status, row.booking_date, today),
          ).length;
          const active = filter === entry.value;
          return (
            <Link
              key={entry.value}
              href={entry.value === "all" ? "/bookings" : `/bookings?status=${entry.value}`}
              aria-current={active ? "page" : undefined}
              className={cn(
                "-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors duration-150",
                active
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
              )}
            >
              {entry.label}
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] font-medium tabular-nums",
                  active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
                )}
              >
                {count}
              </span>
            </Link>
          );
        })}
      </nav>

      {filtered.length === 0 ? (
        <EmptyState
          title="No bookings here"
          description={
            rows.length === 0
              ? "You have not made any bookings yet. Labs and equipment are one request away."
              : "Nothing matches this filter yet."
          }
          action={
            <Button size="sm" render={<Link href="/bookings/new" />}>
              Create a booking
            </Button>
          }
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((row) => (
            <BookingRow
              key={row.id}
              id={row.id}
              title={
                row.resource_type === "lab" && row.lab_id
                  ? (labNames.get(row.lab_id) ?? "Lab booking")
                  : "Equipment request"
              }
              date={row.booking_date}
              start={row.start_time}
              end={row.end_time}
              status={row.booking_status}
              meta={row.purpose.slice(0, 70)}
              today={today}
            />
          ))}
        </div>
      )}
    </PageBody>
  );
}
