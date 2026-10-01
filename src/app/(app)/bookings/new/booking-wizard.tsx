"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  CalendarClock,
  Check,
  ChevronRight,
  CircleCheck,
  FlaskConical,
  ListChecks,
  Loader2,
  Minus,
  Plus,
  Search,
  Send,
  TriangleAlert,
} from "lucide-react";

import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  checkEquipmentAvailability,
  checkLabAvailability,
  createBooking,
  type AvailabilityCheckData,
  type EquipmentCheckData,
} from "@/lib/actions/bookings";
import { addDays } from "@/lib/booking/availability";
import { formatDay } from "@/lib/format";
import { cn } from "@/lib/utils";

type LabOption = {
  id: string;
  name: string;
  code: string;
  capacity: number;
  department_id: string;
  facilities: string[];
  open_time: string;
  close_time: string;
  status: string;
};

type EquipmentOption = {
  id: string;
  name: string;
  assetCode: string;
  categoryName: string;
  labId: string | null;
  available: number;
  total: number;
  maintenanceStatus: string;
};

type Line = { equipmentId: string; quantity: number };

const BLOCKED_MAINTENANCE = ["under_maintenance", "out_of_service"];

const STEPS = [
  { label: "Select resource", icon: FlaskConical },
  { label: "Pick time", icon: CalendarClock },
  { label: "Review", icon: ListChecks },
  { label: "Confirm", icon: Send },
] as const;

type BookingWizardProps = {
  labs: LabOption[];
  equipment: EquipmentOption[];
  initialLabId: string | null;
  initialEquipmentId: string | null;
};

/**
 * Remounts `WizardForm` to start a fresh request after a submission — the
 * action state cannot be cleared any other way.
 */
export function BookingWizard(props: BookingWizardProps) {
  const [instance, setInstance] = useState(0);
  return (
    <WizardForm key={instance} {...props} onBookAnother={() => setInstance((value) => value + 1)} />
  );
}

function WizardForm({
  labs,
  equipment,
  initialLabId,
  initialEquipmentId,
  onBookAnother,
}: BookingWizardProps & { onBookAnother: () => void }) {
  const [mode, setMode] = useState<"lab" | "equipment">(
    initialEquipmentId && !initialLabId ? "equipment" : "lab",
  );
  const [labId, setLabId] = useState<string | null>(() => {
    if (initialLabId && labs.some((lab) => lab.id === initialLabId)) return initialLabId;
    return labs[0]?.id ?? null;
  });
  const [date, setDate] = useState(() => addDays(new Date().toISOString().slice(0, 10), 1));
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("11:00");
  const [attendees, setAttendees] = useState(5);
  const [purpose, setPurpose] = useState("");
  const [lines, setLines] = useState<Line[]>(() =>
    initialEquipmentId ? [{ equipmentId: initialEquipmentId, quantity: 1 }] : [],
  );
  const [equipmentQuery, setEquipmentQuery] = useState("");

  const [labCheck, setLabCheck] = useState<AvailabilityCheckData | null>(null);
  const [labCheckNote, setLabCheckNote] = useState<string | null>(null);
  const [equipmentCheck, setEquipmentCheck] = useState<EquipmentCheckData | null>(null);
  const [checking, startCheckTransition] = useTransition();
  const [state, formAction, submitting] = useActionState(createBooking, null);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const labById = useMemo(() => new Map(labs.map((lab) => [lab.id, lab])), [labs]);
  const equipmentById = useMemo(() => new Map(equipment.map((item) => [item.id, item])), [equipment]);
  const selectedLab = labId ? (labById.get(labId) ?? null) : null;

  // ------------------------------------------------------------------ checks
  useEffect(() => {
    if (mode !== "lab" || !labId || !(start < end)) return;
    let cancelled = false;

    startCheckTransition(async () => {
      const result = await checkLabAvailability({
        labId,
        date,
        start,
        end,
        expectedAttendees: attendees,
      });
      if (cancelled) return;
      setLabCheck(result.ok ? (result.data ?? null) : null);
      setLabCheckNote(result.ok ? null : (result.error ?? "Could not check availability."));
    });

    return () => {
      cancelled = true;
    };
  }, [mode, labId, date, start, end, attendees, startCheckTransition]);

  useEffect(() => {
    if (lines.length === 0) return;
    let cancelled = false;

    startCheckTransition(async () => {
      const result = await checkEquipmentAvailability(lines);
      if (cancelled) return;
      setEquipmentCheck(result.ok ? (result.data ?? null) : null);
    });

    return () => {
      cancelled = true;
    };
  }, [lines, startCheckTransition]);

  // ------------------------------------------------------------------ helpers
  function addLine(option: EquipmentOption) {
    setLines((current) =>
      current.some((line) => line.equipmentId === option.id)
        ? current
        : [...current, { equipmentId: option.id, quantity: 1 }],
    );
  }

  function removeLine(equipmentId: string) {
    setLines((current) => current.filter((line) => line.equipmentId !== equipmentId));
  }

  function setQuantity(equipmentId: string, quantity: number) {
    setLines((current) =>
      current.map((line) => (line.equipmentId === equipmentId ? { ...line, quantity } : line)),
    );
  }

  const filteredEquipment = equipment.filter((item) => {
    if (!equipmentQuery) return true;
    const haystack = `${item.name} ${item.assetCode}`.toLowerCase();
    return haystack.includes(equipmentQuery.toLowerCase());
  });

  const hasResource = mode === "lab" ? Boolean(labId) : lines.length > 0;
  const canSubmit =
    hasResource && purpose.trim().length >= 3 && Boolean(start && end) && start < end && !submitting;

  // ------------------------------------------------------------- submit state
  const bookingId =
    state?.ok && state.data && "bookingId" in state.data ? state.data.bookingId : null;
  const failure = state && !state.ok ? state.data : undefined;
  const submitConflicts =
    failure && "conflicts" in failure
      ? {
          conflicts: failure.conflicts ?? [],
          alternatives: failure.alternatives ?? [],
          ranked: failure.ranked ?? [],
        }
      : null;
  const submitLines = failure && "lines" in failure ? (failure.lines ?? null) : null;

  if (bookingId) {
    return (
      <Card className="mx-auto max-w-xl">
        <CardHeader>
          <div className="flex size-10 items-center justify-center rounded-full bg-success/10">
            <CircleCheck className="size-5 text-success" aria-hidden />
          </div>
          <CardTitle>Request submitted</CardTitle>
          <CardDescription>{state?.message ?? "Lab staff will review your request shortly."}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5 rounded-lg border bg-muted/40 p-3 text-sm">
            <p className="font-medium">
              {mode === "lab"
                ? (selectedLab?.name ?? "Lab booking")
                : `Equipment request (${lines.length} item${lines.length === 1 ? "" : "s"})`}
            </p>
            <p className="text-muted-foreground">
              {formatDay(date)} · {start}–{end}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button render={<Link href={`/bookings/${bookingId}`} />}>View booking</Button>
            <Button variant="outline" onClick={onBookAnother}>
              Book another
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="resourceType" value={mode} />
      <input type="hidden" name="labId" value={mode === "lab" ? (labId ?? "") : ""} />
      <input type="hidden" name="requiredFacilities" value="[]" />
      <input
        type="hidden"
        name="equipment"
        value={JSON.stringify(lines.map((line) => ({ equipmentId: line.equipmentId, quantity: line.quantity })))}
      />

      <ol aria-label="Booking steps" className="flex flex-wrap items-center gap-1.5 text-xs font-medium">
        {STEPS.map((step, index) => (
          <li key={step.label} className="flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-muted-foreground shadow-xs">
              <step.icon className="size-3.5 text-primary" aria-hidden />
              {step.label}
            </span>
            {index < STEPS.length - 1 ? (
              <ChevronRight className="size-3.5 text-muted-foreground/60" aria-hidden />
            ) : null}
          </li>
        ))}
      </ol>

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
        {/* ------------------------------------------------------------ step 1 */}
        <Card>
          <CardHeader>
            <CardTitle>1. What do you need?</CardTitle>
            <CardDescription>Book a lab, equipment, or both in one request.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="inline-flex rounded-lg border border-border bg-muted p-0.5">
              {(
                [
                  { value: "lab", label: "Lab + equipment" },
                  { value: "equipment", label: "Equipment only" },
                ] as const
              ).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setMode(option.value)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-150",
                    mode === option.value
                      ? "bg-card text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>

            {mode === "lab" ? (
              <div className="space-y-1.5">
                <Label>Lab</Label>
                <div className="max-h-60 space-y-1 overflow-y-auto pr-1">
                  {labs.map((lab) => (
                    <button
                      type="button"
                      key={lab.id}
                      onClick={() => setLabId(lab.id)}
                      className={cn(
                        "flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                        labId === lab.id ? "border-primary bg-primary/5" : "hover:bg-muted/50",
                      )}
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{lab.name}</span>
                        <span className="block text-xs text-muted-foreground">
                          {lab.code} · {lab.capacity} seats · {lab.open_time.slice(0, 5)}–{lab.close_time.slice(0, 5)}
                        </span>
                      </span>
                      {labId === lab.id ? <Check className="size-4 shrink-0 text-primary" aria-hidden /> : null}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="space-y-2">
              <Label>{mode === "lab" ? "Equipment (optional)" : "Equipment"}</Label>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  value={equipmentQuery}
                  onChange={(event) => setEquipmentQuery(event.target.value)}
                  placeholder="Search equipment"
                  className="pl-8"
                />
              </div>

              <div className="max-h-60 space-y-1 overflow-y-auto pr-1">
                {filteredEquipment.map((item) => {
                  const line = lines.find((entry) => entry.equipmentId === item.id);
                  const blocked = BLOCKED_MAINTENANCE.includes(item.maintenanceStatus);
                  const outOfStock = item.available <= 0;

                  return (
                    <div
                      key={item.id}
                      className={cn(
                        "flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm",
                        line ? "border-primary/50 bg-primary/5" : "",
                      )}
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">{item.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.assetCode} · {item.categoryName} ·{" "}
                          <span className={outOfStock ? "text-destructive" : ""}>
                            {item.available} of {item.total} free
                          </span>
                        </p>
                      </div>

                      {line ? (
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="outline"
                            aria-label="Decrease quantity"
                            onClick={() => {
                              if (line.quantity <= 1) removeLine(item.id);
                              else setQuantity(item.id, line.quantity - 1);
                            }}
                          >
                            <Minus className="size-3" aria-hidden />
                          </Button>
                          <span className="w-6 text-center text-sm font-medium tabular-nums">{line.quantity}</span>
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="outline"
                            aria-label="Increase quantity"
                            disabled={line.quantity >= item.available}
                            onClick={() => setQuantity(item.id, line.quantity + 1)}
                          >
                            <Plus className="size-3" aria-hidden />
                          </Button>
                        </div>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={outOfStock || blocked}
                          title={blocked ? "Under maintenance" : undefined}
                          onClick={() => addLine(item)}
                        >
                          Add
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ------------------------------------------------------------ step 2 */}
        <Card>
          <CardHeader>
            <CardTitle>2. When?</CardTitle>
            <CardDescription>Availability is checked as you choose.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="booking-date">Date</Label>
              <Input
                id="booking-date"
                name="date"
                type="date"
                min={today}
                value={date}
                onChange={(event) => setDate(event.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="booking-start">Start</Label>
              <Input
                id="booking-start"
                name="start"
                type="time"
                value={start}
                onChange={(event) => setStart(event.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="booking-end">End</Label>
              <Input
                id="booking-end"
                name="end"
                type="time"
                value={end}
                onChange={(event) => setEnd(event.target.value)}
                required
              />
            </div>
            {selectedLab && mode === "lab" ? (
              <p className="text-xs text-muted-foreground sm:col-span-3">
                {selectedLab.name} is open {selectedLab.open_time.slice(0, 5)}–{selectedLab.close_time.slice(0, 5)}.
              </p>
            ) : null}
          </CardContent>
        </Card>

        {/* ------------------------------------------------------------ step 3 */}
        <Card>
          <CardHeader>
            <CardTitle>3. Details</CardTitle>
            <CardDescription>Staff read this when reviewing the request.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {mode === "lab" ? (
              <div className="space-y-1.5">
                <Label htmlFor="booking-attendees">Expected attendees</Label>
                <Input
                  id="booking-attendees"
                  name="expectedAttendees"
                  type="number"
                  min={1}
                  max={selectedLab?.capacity ?? 999}
                  value={attendees}
                  onChange={(event) => setAttendees(Number(event.target.value) || 1)}
                />
                {selectedLab && attendees > selectedLab.capacity ? (
                  <p className="text-xs text-destructive">
                    That is more than {selectedLab.name} seats ({selectedLab.capacity}).
                  </p>
                ) : null}
              </div>
            ) : (
              <input type="hidden" name="expectedAttendees" value="" />
            )}

            <div className="space-y-1.5">
              <Label htmlFor="booking-purpose">Purpose</Label>
              <Textarea
                id="booking-purpose"
                name="purpose"
                value={purpose}
                onChange={(event) => setPurpose(event.target.value)}
                placeholder="e.g. Embedded systems midterm exam practice"
                rows={3}
                required
                minLength={3}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ------------------------------------------------------------- summary */}
      <aside className="space-y-4 lg:sticky lg:top-24">
        <div className="glass rounded-2xl border p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold">Summary</h2>
            <span className="text-xs text-muted-foreground">Step 4 of 4</span>
          </div>
          <div className="mt-4 space-y-4 text-sm">
            <div className="space-y-1">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Resource</p>
              <p className="font-medium">
                {mode === "lab" ? (selectedLab?.name ?? "Pick a lab") : "Equipment only"}
              </p>
              {mode === "lab" && selectedLab ? (
                <p className="text-xs text-muted-foreground">
                  {selectedLab.code} · {selectedLab.capacity} seats
                </p>
              ) : null}
            </div>

            <div className="space-y-1">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">When</p>
              <p>
                {formatDay(date)} · {start}–{end}
              </p>
            </div>

            {lines.length > 0 ? (
              <div className="space-y-1">
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Equipment</p>
                <ul className="space-y-1">
                  {lines.map((line) => (
                    <li key={line.equipmentId} className="flex items-center justify-between gap-2">
                      <span className="truncate">{equipmentById.get(line.equipmentId)?.name ?? "Item"}</span>
                      <span className="text-muted-foreground">× {line.quantity}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {/* live availability */}
            {mode === "lab" ? (
              checking && !labCheck && !labCheckNote ? (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" aria-hidden />
                  Checking availability…
                </p>
              ) : labCheckNote ? (
                <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {labCheckNote}
                </p>
              ) : labCheck ? (
                labCheck.isFree && labCheck.withinOpenHours ? (
                  <p className="flex items-center gap-1.5 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-xs text-success">
                    <CircleCheck className="size-3.5" aria-hidden />
                    Available for the whole window.
                  </p>
                ) : (
                  <div className="space-y-3 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2.5 text-xs">
                    {!labCheck.withinOpenHours ? (
                      <p className="flex items-start gap-1.5 text-warning">
                        <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                        Outside opening hours ({labCheck.openTime}–{labCheck.closeTime}).
                      </p>
                    ) : null}

                    {labCheck.conflicts.length > 0 ? (
                      <div className="space-y-1">
                        <p className="font-medium text-warning">
                          Already booked for part of that window:
                        </p>
                        {labCheck.conflicts.map((conflict) => (
                          <div key={`${conflict.start}-${conflict.end}`} className="flex items-center justify-between gap-2">
                            <span>
                              {conflict.start.slice(0, 5)}–{conflict.end.slice(0, 5)}
                            </span>
                            <StatusBadge status={conflict.status} />
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {labCheck.alternatives.length > 0 ? (
                      <div className="space-y-1">
                        <p className="font-medium">Free times:</p>
                        <div className="flex flex-wrap gap-1">
                          {labCheck.alternatives.map((slot) => (
                            <button
                              key={`${slot.date}-${slot.start}`}
                              type="button"
                              onClick={() => {
                                setDate(slot.date);
                                setStart(slot.start);
                                setEnd(slot.end);
                              }}
                              className="rounded-full border border-border bg-card px-2.5 py-1 transition-colors hover:border-primary hover:text-primary"
                            >
                              {slot.date === date ? "" : `${formatDay(slot.date)} `}
                              {slot.start.slice(0, 5)}–{slot.end.slice(0, 5)}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {labCheck.ranked.filter((candidate) => candidate.isFree).length > 0 ? (
                      <div className="space-y-1">
                        <p className="font-medium">Other labs that fit:</p>
                        <div className="space-y-1">
                          {labCheck.ranked
                            .filter((candidate) => candidate.isFree)
                            .slice(0, 4)
                            .map((candidate) => (
                              <button
                                key={candidate.labId}
                                type="button"
                                onClick={() => setLabId(candidate.labId)}
                                className="flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5 text-left transition-colors hover:border-primary"
                              >
                                <span className="min-w-0">
                                  <span className="block truncate font-medium">{candidate.name}</span>
                                  <span className="block truncate text-[10px] text-muted-foreground">
                                    {candidate.reasons[0] ?? `${candidate.capacity} seats`}
                                  </span>
                                </span>
                                <span className="shrink-0 font-semibold text-primary">{candidate.matchPercent}%</span>
                              </button>
                            ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                )
              ) : null
            ) : null}

            {equipmentCheck && lines.length > 0 ? (
              <div className="space-y-1.5">
                {equipmentCheck.lines.map((line) => (
                  <div key={line.equipmentId} className="flex items-start justify-between gap-2 text-xs">
                    <span className={cn("min-w-0", line.feasible ? "text-muted-foreground" : "text-destructive")}>
                      <span className="truncate">{line.name}:</span> {line.message}
                    </span>
                    {!line.feasible && line.suggestedQuantity > 0 ? (
                      <button
                        type="button"
                        className="shrink-0 text-primary hover:underline"
                        onClick={() => setQuantity(line.equipmentId, line.suggestedQuantity)}
                      >
                        Use {line.suggestedQuantity}
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}

            {/* submit-time failures that carry data */}
            {submitConflicts ? (
              <div className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-xs">
                <p className="flex items-start gap-1.5 font-medium text-destructive">
                  <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  {state?.error ?? "That slot was taken while you were filling the form."}
                </p>
                {submitConflicts.conflicts.length > 0 ? (
                  <ul className="space-y-1">
                    {submitConflicts.conflicts.map((conflict) => (
                      <li key={`${conflict.start}-${conflict.end}`}>
                        {conflict.start.slice(0, 5)}–{conflict.end.slice(0, 5)}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {submitConflicts.alternatives.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {submitConflicts.alternatives.map((slot) => (
                      <button
                        key={`${slot.date}-${slot.start}`}
                        type="button"
                        className="rounded-full border border-border bg-card px-2.5 py-1 transition-colors hover:border-primary"
                        onClick={() => {
                          setDate(slot.date);
                          setStart(slot.start);
                          setEnd(slot.end);
                        }}
                      >
                        {slot.date === date ? "" : `${formatDay(slot.date)} `}
                        {slot.start.slice(0, 5)}–{slot.end.slice(0, 5)}
                      </button>
                    ))}
                  </div>
                ) : null}
                {submitConflicts.ranked.filter((candidate) => candidate.isFree).length > 0 ? (
                  <div className="space-y-1">
                    {submitConflicts.ranked
                      .filter((candidate) => candidate.isFree)
                      .slice(0, 3)
                      .map((candidate) => (
                        <button
                          key={candidate.labId}
                          type="button"
                          className="flex w-full items-center justify-between gap-2 rounded-md border bg-background px-2 py-1 text-left hover:border-primary"
                          onClick={() => setLabId(candidate.labId)}
                        >
                          <span className="truncate">{candidate.name}</span>
                          <span className="shrink-0 font-semibold text-primary">{candidate.matchPercent}%</span>
                        </button>
                      ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            {submitLines ? (
              <div className="space-y-1.5 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-xs">
                {submitLines.map((line) => (
                  <p key={line.equipmentId} className="text-destructive">
                    {line.message}
                  </p>
                ))}
              </div>
            ) : null}

            {state && !state.ok && state.error && !submitConflicts && !submitLines ? (
              <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {state.error}
              </p>
            ) : null}

            <Button type="submit" className="w-full" disabled={!canSubmit}>
              {submitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  Submitting…
                </>
              ) : (
                <>
                  <Send className="size-4" aria-hidden />
                  Submit request
                </>
              )}
            </Button>
            <p className="text-center text-[11px] text-muted-foreground">
              Requests are reviewed by lab staff before the slot is reserved.
            </p>
          </div>
        </div>
      </aside>
      </div>
    </form>
  );
}
