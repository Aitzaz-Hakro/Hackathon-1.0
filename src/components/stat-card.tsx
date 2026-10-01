import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Dashboard metric tile.
 *
 * `tone` is used sparingly — only for tiles where a number being non-zero is
 * itself a signal (overdue equipment, damage reports). Colouring every tile
 * would flatten the ones that matter.
 */

const TONE_VALUES = {
  default: "text-foreground",
  positive: "text-success",
  warning: "text-warning",
  danger: "text-destructive",
} as const;

const TONE_ICONS = {
  default: "bg-muted text-muted-foreground",
  positive: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  danger: "bg-destructive/10 text-destructive",
} as const;

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
  className,
}: {
  label: string;
  value: number | string;
  hint?: string;
  icon?: LucideIcon;
  tone?: "default" | "positive" | "warning" | "danger";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card p-4 shadow-xs transition-shadow duration-200 hover:shadow-soft",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        {Icon ? (
          <span
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-lg",
              TONE_ICONS[tone],
            )}
          >
            <Icon className="size-4" aria-hidden />
          </span>
        ) : null}
      </div>
      <p className={cn("mt-2 text-2xl font-semibold tracking-tight tabular-nums", TONE_VALUES[tone])}>
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
