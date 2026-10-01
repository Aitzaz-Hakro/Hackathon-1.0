import { CalendarCheck2, CircleCheckBig, Clock, Wrench, type LucideIcon } from "lucide-react";

import { STATUS_LABELS, STATUS_TONES, type BookingStatus, type StatusTone } from "@/lib/booking/status";
import { toMinutes } from "@/lib/booking/availability";
import { cn } from "@/lib/utils";

export type TimelineBlock = {
  start: string;
  end: string;
  status: BookingStatus;
};

/**
 * Tinted blocks with a coloured edge, not solid fills: the timeline surface
 * stays solid white and every block clears AA contrast in both themes.
 * Colour is always paired with the status label and, in the legend, an icon.
 */
const BLOCK_CLASSES: Record<StatusTone, string> = {
  neutral: "border-muted-foreground/40 bg-muted text-muted-foreground",
  info: "border-info bg-info/12 text-info",
  violet: "border-violet bg-violet/12 text-violet",
  warning: "border-warning bg-warning/12 text-warning",
  success: "border-success bg-success/12 text-success",
  danger: "border-destructive bg-destructive/12 text-destructive",
};

function boundaryLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

/**
 * Skedda-style occupancy grid for one day: an hour ruler over a single track
 * from opening to closing time, with one block per committed interval.
 *
 * Pure presentational — the caller supplies the blocks, so it can be reused
 * for a single lab or a row in a multi-lab grid. Blocks are focusable so the
 * timeline is navigable by keyboard, with the full time range on `aria-label`.
 */
export function AvailabilityTimeline({
  openTime,
  closeTime,
  blocks,
  className,
}: {
  openTime: string;
  closeTime: string;
  blocks: TimelineBlock[];
  className?: string;
}) {
  const open = toMinutes(openTime);
  const close = toMinutes(closeTime);
  const span = Math.max(close - open, 1);

  const visible = blocks
    .map((block) => ({
      ...block,
      startMinutes: Math.max(toMinutes(block.start), open),
      endMinutes: Math.min(toMinutes(block.end), close),
    }))
    .filter((block) => block.endMinutes > block.startMinutes);

  const step = span <= 360 ? 60 : 120;
  const ticks: number[] = [];
  for (let minutes = open; minutes <= close; minutes += step) ticks.push(minutes);
  if (ticks[ticks.length - 1] !== close) ticks.push(close);

  return (
    <div className={cn("overflow-hidden rounded-xl border border-border bg-card", className)}>
      <div className="relative h-7 border-b border-border bg-muted/30">
        {ticks.map((minutes) => (
          <span
            key={minutes}
            className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 text-[10px] font-medium tabular-nums text-muted-foreground"
            style={{ left: `${((minutes - open) / span) * 100}%` }}
          >
            {boundaryLabel(minutes)}
          </span>
        ))}
      </div>

      <div className="relative h-16">
        {ticks.map((minutes) => (
          <span
            key={minutes}
            aria-hidden
            className="absolute inset-y-0 w-px bg-border/70"
            style={{ left: `${((minutes - open) / span) * 100}%` }}
          />
        ))}

        {visible.map((block, index) => {
          const start = boundaryLabel(block.startMinutes);
          const end = boundaryLabel(block.endMinutes);
          return (
            <div
              key={`${block.start}-${block.end}-${index}`}
              tabIndex={0}
              aria-label={`${STATUS_LABELS[block.status]}, ${start} to ${end}`}
              title={`${start}–${end} · ${STATUS_LABELS[block.status]}`}
              className={cn(
                "absolute inset-y-2 flex items-center overflow-hidden rounded-md border-l-2 px-2 text-[11px] font-medium transition-[box-shadow,transform] duration-150 ease-out hover:z-10 hover:shadow-soft focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:outline-none",
                BLOCK_CLASSES[STATUS_TONES[block.status]],
              )}
              style={{
                left: `${((block.startMinutes - open) / span) * 100}%`,
                width: `${((block.endMinutes - block.startMinutes) / span) * 100}%`,
              }}
            >
              <span className="truncate">{STATUS_LABELS[block.status]}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const LEGEND: Array<{ label: string; tone: StatusTone; icon: LucideIcon }> = [
  { label: "Pending request", tone: "warning", icon: Clock },
  { label: "Reserved / in use", tone: "info", icon: CalendarCheck2 },
  { label: "Completed", tone: "success", icon: CircleCheckBig },
  { label: "Maintenance", tone: "warning", icon: Wrench },
];

export function TimelineLegend({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {LEGEND.map((entry) => (
        <span
          key={entry.label}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-xs text-muted-foreground"
        >
          <entry.icon
            className={cn(
              "size-3.5",
              entry.tone === "info" && "text-info",
              entry.tone === "warning" && "text-warning",
              entry.tone === "success" && "text-success",
              entry.tone === "danger" && "text-destructive",
              entry.tone === "violet" && "text-violet",
            )}
            aria-hidden
          />
          {entry.label}
        </span>
      ))}
    </div>
  );
}
