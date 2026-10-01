import {
  Ban,
  CalendarCheck2,
  CircleCheck,
  CircleCheckBig,
  CircleX,
  Clock,
  Hourglass,
  Pencil,
  Play,
  TriangleAlert,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { STATUS_LABELS, STATUS_TONES, type BookingStatus, type StatusTone } from "@/lib/booking/status";
import type { ApprovalStatus } from "@/lib/types";

/**
 * The bookend of nearly every screen in this app: the rulebook defines eleven
 * booking statuses plus three approval states, and they appear on cards,
 * tables, timelines and the staff queue.
 *
 * Every badge pairs the semantic colour with an icon and a text label — colour
 * is never the only signal. Tones come from the tokens in globals.css, so a
 * status can never be amber on the dashboard and green on the detail page.
 */

const BADGE =
  "inline-flex h-5 w-fit shrink-0 items-center gap-1.5 rounded-4xl border px-2 py-0.5 text-xs font-medium whitespace-nowrap";

const TONE_CLASSES: Record<StatusTone, string> = {
  neutral: "bg-muted text-muted-foreground border-border",
  info: "bg-info/10 text-info border-info/20",
  violet: "bg-violet/10 text-violet border-violet/20",
  warning: "bg-warning/10 text-warning border-warning/20",
  success: "bg-success/10 text-success border-success/20",
  danger: "bg-destructive/10 text-destructive border-destructive/20",
};

const STATUS_ICONS: Record<BookingStatus, LucideIcon> = {
  draft: Pencil,
  pending_approval: Clock,
  approved: CircleCheck,
  reserved: CalendarCheck2,
  in_use: Play,
  completed: CircleCheckBig,
  rejected: CircleX,
  cancelled: Ban,
  overdue: TriangleAlert,
  returned_late: Hourglass,
  damaged: Wrench,
};

export function StatusBadge({
  status,
  className,
  showIcon = true,
}: {
  status: BookingStatus;
  className?: string;
  showIcon?: boolean;
}) {
  const tone = STATUS_TONES[status];
  const Icon = STATUS_ICONS[status];

  return (
    <span className={cn(BADGE, TONE_CLASSES[tone], className)}>
      {showIcon ? <Icon className="size-3 shrink-0" aria-hidden /> : null}
      {STATUS_LABELS[status]}
    </span>
  );
}

const APPROVAL_LABELS: Record<ApprovalStatus, string> = {
  pending: "Awaiting review",
  approved: "Approved",
  rejected: "Rejected",
};

const APPROVAL_TONES: Record<ApprovalStatus, StatusTone> = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
};

const APPROVAL_ICONS: Record<ApprovalStatus, LucideIcon> = {
  pending: Clock,
  approved: CircleCheck,
  rejected: CircleX,
};

export function ApprovalBadge({ status, className }: { status: ApprovalStatus; className?: string }) {
  const tone = APPROVAL_TONES[status];
  const Icon = APPROVAL_ICONS[status];

  return (
    <span className={cn(BADGE, TONE_CLASSES[tone], className)}>
      <Icon className="size-3 shrink-0" aria-hidden />
      {APPROVAL_LABELS[status]}
    </span>
  );
}

/**
 * Generic tone badge, for the things that are not booking statuses —
 * maintenance state, equipment condition, priority band. Pass `icon` wherever
 * the meaning is not carried by the label alone.
 */
export function ToneBadge({
  tone,
  icon: Icon,
  children,
  className,
}: {
  tone: StatusTone;
  icon?: LucideIcon;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={cn(BADGE, TONE_CLASSES[tone], className)}>
      {Icon ? <Icon className="size-3 shrink-0" aria-hidden /> : null}
      {children}
    </span>
  );
}

/** Equipment condition and maintenance state, mapped onto the same tones. */
export const EQUIPMENT_CONDITION_TONES: Record<string, StatusTone> = {
  new: "success",
  good: "success",
  fair: "warning",
  damaged: "danger",
  retired: "neutral",
};

export const MAINTENANCE_TONES: Record<string, StatusTone> = {
  operational: "success",
  needs_service: "warning",
  under_maintenance: "warning",
  out_of_service: "danger",
};

export const LAB_STATUS_TONES: Record<string, StatusTone> = {
  available: "success",
  reserved: "info",
  in_use: "info",
  maintenance: "warning",
  closed: "neutral",
};

export function titleCase(value: string): string {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
