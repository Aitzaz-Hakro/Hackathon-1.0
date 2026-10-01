import { cn } from "@/lib/utils";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * Usage heatmap: weekday rows by hour columns, intensity scaled from booking
 * counts. Pure CSS grid — no chart library, so it renders on the server and
 * carries no interaction risk. Empty cells use the muted surface so the grid
 * stays legible even with no data.
 */
export function UsageHeatmap({
  matrix,
  hours,
  max,
}: {
  /** 7 rows (Monday first) of hour buckets. */
  matrix: number[][];
  hours: number[];
  max: number;
}) {
  return (
    <div className="space-y-1.5">
      {matrix.map((row, dayIndex) => (
        <div key={dayIndex} className="flex items-center gap-2">
          <span className="w-8 shrink-0 text-right text-[10px] font-medium text-muted-foreground">
            {DAY_LABELS[dayIndex]}
          </span>
          <div
            className="grid flex-1 gap-1"
            style={{ gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))` }}
          >
            {row.map((value, hourIndex) => (
              <div
                key={hourIndex}
                className={cn(
                  "h-5 rounded-md transition-shadow duration-150",
                  value === 0 ? "bg-muted" : "bg-primary hover:ring-2 hover:ring-ring/50",
                )}
                style={value === 0 ? undefined : { opacity: 0.18 + 0.82 * (value / Math.max(max, 1)) }}
                title={`${DAY_LABELS[dayIndex]} ${String(hours[hourIndex]).padStart(2, "0")}:00 — ${value} booking${value === 1 ? "" : "s"}`}
              />
            ))}
          </div>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <span className="w-8 shrink-0" />
        <div
          className="grid flex-1 gap-1"
          style={{ gridTemplateColumns: `repeat(${hours.length}, minmax(0, 1fr))` }}
        >
          {hours.map((hour) => (
            <span key={hour} className="text-center text-[9px] tabular-nums text-muted-foreground">
              {hour % 2 === 0 ? hour : ""}
            </span>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-end gap-1.5 pt-1 text-[10px] text-muted-foreground">
        <span>Less</span>
        {[0.18, 0.42, 0.66, 0.9].map((opacity) => (
          <span key={opacity} className="size-3 rounded-[4px] bg-primary" style={{ opacity }} />
        ))}
        <span>More</span>
      </div>
    </div>
  );
}
