import Link from "next/link";

import { StatusBadge } from "@/components/status-badge";
import type { BookingStatus } from "@/lib/booking/status";
import { formatDayRelative, formatTimeRange } from "@/lib/format";

/**
 * One booking rendered as a row. Used by the dashboard, booking history and
 * anywhere a compact list of bookings appears.
 */
export function BookingRow({
  id,
  title,
  date,
  start,
  end,
  status,
  meta,
  today,
}: {
  id: string;
  title: string;
  date: string;
  start: string;
  end: string;
  status: BookingStatus;
  meta?: string;
  today: string;
}) {
  return (
    <Link
      href={`/bookings/${id}`}
      className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-xs transition-[border-color,background-color,box-shadow] duration-150 ease-out hover:border-primary/30 hover:shadow-soft"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{title}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {formatDayRelative(date, today)} · {formatTimeRange(start, end)}
          {meta ? ` · ${meta}` : ""}
        </p>
      </div>
      <StatusBadge status={status} />
    </Link>
  );
}
