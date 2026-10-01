"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { CircleCheck, Loader2, Sparkles, TriangleAlert } from "lucide-react";

import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import {
  checkEquipmentAvailability,
  checkLabAvailability,
  type AvailabilityCheckData,
  type EquipmentCheckData,
} from "@/lib/actions/bookings";
import { parseBookingRequest } from "@/lib/ai/actions";
import type { AssistantResult, PreviousIntent } from "@/lib/ai/schema";
import { encodeBookingIntent, type BookingIntent } from "@/lib/booking/intent";
import { formatDay, formatTimeRange } from "@/lib/format";
import { cn } from "@/lib/utils";

type Selection = {
  labId: string | null;
  date: string | null;
  start: string | null;
  end: string | null;
  purpose: string;
  attendees: number | null;
  equipment: { equipmentId: string; quantity: number }[];
};

type ChatMessage = { id: number; role: "user" | "assistant"; text: string };

const EXAMPLES = [
  "Book the Embedded Systems Lab Friday 2-4pm for 5 Arduino kits — capstone demo",
  "Networking lab next Tuesday 10am to noon for a security workshop",
  "Oscilloscope tomorrow morning for a physics practical",
];

const QUICK_REFINEMENTS = ["Make it 2 hours", "Same time next week"];

export function BookingAssistant() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [command, setCommand] = useState("");
  const [pending, startTransition] = useTransition();
  const [data, setData] = useState<AssistantResult | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const messageId = useRef(0);
  const endRef = useRef<HTMLDivElement | null>(null);

  const [clarifyAnswered, setClarifyAnswered] = useState(false);
  const [clarifyDate, setClarifyDate] = useState("");
  const [clarifyStart, setClarifyStart] = useState("10:00");
  const [clarifyEnd, setClarifyEnd] = useState("12:00");

  const [live, setLive] = useState<AvailabilityCheckData | null>(null);
  const [liveEquipment, setLiveEquipment] = useState<EquipmentCheckData | null>(null);
  const [checking, startCheck] = useTransition();

  function pushMessage(role: "user" | "assistant", text: string) {
    setMessages((current) => [...current, { id: messageId.current++, role, text }]);
  }

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, pending, data]);

  function applyResult(result: AssistantResult) {
    setData(result);
    setClarifyAnswered(false);

    const map: Record<string, string> = {};
    if (result.lab) map[result.lab.id] = result.lab.name;
    for (const lab of result.labDirectory) map[lab.id] = lab.name;
    for (const lab of result.labCandidates) map[lab.id] = lab.name;
    for (const line of result.equipment) map[line.equipmentId] = line.name;
    for (const group of result.unmatchedEquipment) {
      for (const candidate of group.candidates) map[candidate.id] = candidate.name;
    }
    setNames((current) => ({ ...current, ...map }));

    setSelection({
      labId: result.lab?.id ?? null,
      date: result.date,
      start: result.start,
      end: result.end,
      purpose: result.purpose,
      attendees: result.attendees,
      equipment: result.equipment.map((line) => ({
        equipmentId: line.equipmentId,
        quantity: line.requestedQuantity,
      })),
    });
  }

  function reset() {
    setData(null);
    setSelection(null);
    setMessages([]);
    setText("");
    setCommand("");
    setLive(null);
    setLiveEquipment(null);
    setClarifyAnswered(false);
  }

  function parse() {
    const request = text.trim();
    if (request.length < 3 || pending) return;
    pushMessage("user", request);
    startTransition(async () => {
      const result = await parseBookingRequest(request);
      if (result.ok && result.data) {
        applyResult(result.data);
        pushMessage("assistant", result.data.assistantMessage);
      } else {
        pushMessage("assistant", result.error ?? "Sorry — I could not handle that. Try rephrasing.");
      }
    });
  }

  function runCommand(instruction: string) {
    const request = instruction.trim();
    if (!request || !selection || pending) return;

    const previous: PreviousIntent = {
      lab: selection.labId ? (names[selection.labId] ?? null) : null,
      date: selection.date,
      start: selection.start,
      end: selection.end,
      purpose: selection.purpose,
      attendees: selection.attendees,
      equipment: selection.equipment.map((line) => ({
        name: names[line.equipmentId] ?? "item",
        quantity: line.quantity,
      })),
    };

    setCommand("");
    pushMessage("user", request);
    startTransition(async () => {
      const result = await parseBookingRequest(request, previous);
      if (result.ok && result.data) {
        applyResult(result.data);
        pushMessage("assistant", result.data.assistantMessage);
      } else {
        pushMessage("assistant", result.error ?? "Could not do that — try rephrasing.");
      }
    });
  }

  // Live re-check on every selection change — the same read-only actions the
  // wizard uses. The assistant still never writes anything.
  useEffect(() => {
    if (!selection) return;
    const { labId, date, start, end, equipment, attendees } = selection;
    let cancelled = false;

    startCheck(async () => {
      if (labId && date && start && end && start < end) {
        const result = await checkLabAvailability({
          labId,
          date,
          start,
          end,
          expectedAttendees: attendees ?? undefined,
        });
        if (!cancelled) setLive(result.ok ? (result.data ?? null) : null);
      } else if (!cancelled) {
        setLive(null);
      }

      if (equipment.length > 0) {
        const result = await checkEquipmentAvailability(equipment);
        if (!cancelled) setLiveEquipment(result.ok ? (result.data ?? null) : null);
      } else if (!cancelled) {
        setLiveEquipment(null);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [selection, startCheck]);

  const conflicts = live?.conflicts ?? data?.conflicts ?? [];
  const alternatives = live?.alternatives ?? data?.alternatives ?? [];
  const isFree = live ? live.isFree : (data?.isFree ?? null);
  const withinOpenHours = live ? live.withinOpenHours : (data?.withinOpenHours ?? null);
  const equipLines = liveEquipment?.lines ?? data?.equipment ?? [];

  const labPicks = useMemo(() => {
    const ranked = (live?.ranked ?? data?.ranked ?? []).filter(
      (candidate) => candidate.isFree && candidate.labId !== selection?.labId,
    );
    if (ranked.length > 0) {
      return ranked.slice(0, 4).map((candidate) => ({
        id: candidate.labId,
        name: candidate.name,
        hint: `${candidate.matchPercent}% match`,
      }));
    }
    return (data?.labCandidates ?? [])
      .filter((candidate) => candidate.id !== selection?.labId)
      .slice(0, 4)
      .map((candidate) => ({ id: candidate.id, name: candidate.name, hint: "closest name" }));
  }, [live?.ranked, data?.ranked, data?.labCandidates, selection?.labId]);

  function chooseSlot(slot: { date: string; start: string; end: string }) {
    setSelection((current) =>
      current ? { ...current, date: slot.date, start: slot.start, end: slot.end } : current,
    );
    setClarifyAnswered(true);
    pushMessage("user", `Use ${formatDay(slot.date)} · ${formatTimeRange(slot.start, slot.end)}`);
    pushMessage(
      "assistant",
      `Moved to ${formatDay(slot.date)} · ${formatTimeRange(slot.start, slot.end)} — re-checking availability…`,
    );
  }

  function chooseLab(id: string) {
    setSelection((current) => (current ? { ...current, labId: id } : current));
    setClarifyAnswered(true);
    const name = names[id] ?? "that lab";
    pushMessage("user", `Use ${name}`);
    pushMessage("assistant", `Switched to ${name} — re-checking…`);
  }

  function addEquipment(candidate: { id: string; name: string }) {
    setSelection((current) =>
      current
        ? {
            ...current,
            equipment: [
              ...current.equipment.filter((line) => line.equipmentId !== candidate.id),
              { equipmentId: candidate.id, quantity: 1 },
            ],
          }
        : current,
    );
    setNames((current) => ({ ...current, [candidate.id]: candidate.name }));
    pushMessage("user", `Add ${candidate.name}`);
    pushMessage("assistant", `Added ${candidate.name} — checking availability…`);
  }

  function setQuantity(equipmentId: string, quantity: number) {
    setSelection((current) =>
      current
        ? {
            ...current,
            equipment: current.equipment.map((line) =>
              line.equipmentId === equipmentId ? { ...line, quantity } : line,
            ),
          }
        : current,
    );
    const name = names[equipmentId] ?? "the item";
    pushMessage("user", `Use ${quantity} of ${name}`);
    pushMessage("assistant", `Done — ${name} is set to ${quantity}.`);
  }

  function applyClarifyTimes() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(clarifyDate)) return;
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(clarifyStart) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(clarifyEnd)) return;
    if (clarifyStart >= clarifyEnd) return;
    setSelection((current) =>
      current ? { ...current, date: clarifyDate, start: clarifyStart, end: clarifyEnd } : current,
    );
    setClarifyAnswered(true);
    pushMessage("user", `Use ${formatDay(clarifyDate)} · ${clarifyStart}–${clarifyEnd}`);
    pushMessage("assistant", `Got it — checking ${formatDay(clarifyDate)} · ${clarifyStart}–${clarifyEnd}.`);
  }

  const wizardUrl = useMemo(() => {
    if (!selection) return null;
    const params = new URLSearchParams();
    if (selection.labId) params.set("lab", selection.labId);
    if (selection.equipment[0]) params.set("equipment", selection.equipment[0].equipmentId);
    const intent: BookingIntent = {
      lab: selection.labId,
      equipment: selection.equipment.map((line) => ({ id: line.equipmentId, quantity: line.quantity })),
      date: selection.date,
      start: selection.start,
      end: selection.end,
      purpose: selection.purpose,
      attendees: selection.attendees,
    };
    params.set("intent", encodeBookingIntent(intent));
    return `/bookings/new?${params.toString()}`;
  }, [selection]);

  const showClarification = Boolean(data?.needsClarification) && !clarifyAnswered;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button variant="outline" size="sm" />}>
        <Sparkles className="size-4" aria-hidden />
        Ask AI
      </SheetTrigger>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-md">
        <SheetHeader className="border-b border-border">
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" aria-hidden />
            Booking assistant
          </SheetTitle>
          <SheetDescription>
            Describe the booking in your own words — it is matched to real labs, equipment and availability.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {!data ? (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="assistant-request">Your request</Label>
                <Textarea
                  id="assistant-request"
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  placeholder="Book the Embedded Systems Lab Friday 2-4pm for 5 Arduino kits — capstone demo"
                  rows={3}
                  maxLength={400}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      parse();
                    }
                  }}
                />
              </div>
              <Button onClick={parse} disabled={pending || text.trim().length < 3} className="w-full">
                {pending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    Thinking…
                  </>
                ) : (
                  "Parse request"
                )}
              </Button>
              <div className="flex flex-wrap gap-1.5">
                {EXAMPLES.map((example) => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => setText(example)}
                    className="rounded-full border border-border bg-card px-2.5 py-1 text-left text-[11px] text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                  >
                    {example.length > 48 ? `${example.slice(0, 48)}…` : example}
                  </button>
                ))}
              </div>
            </>
          ) : null}

          {messages.map((message) => (
            <div
              key={message.id}
              className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}
            >
              <p
                className={cn(
                  "max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap",
                  message.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground",
                )}
              >
                {message.text}
              </p>
            </div>
          ))}

          {pending ? (
            <div className="flex justify-start">
              <p className="flex items-center gap-2 rounded-2xl bg-muted px-3 py-2 text-sm text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
                Thinking…
              </p>
            </div>
          ) : null}

          {data && selection ? (
            <div className="space-y-3">
              {showClarification ? (
                <div className="space-y-3 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2.5 text-xs">
                  <p className="text-muted-foreground">
                    {data.clarificationQuestion ?? "Which resource, and when would you like it?"}
                  </p>

                  {!selection.labId && data.labDirectory.length > 0 ? (
                    <div className="space-y-1">
                      <p className="font-medium text-warning">Pick a lab</p>
                      <div className="flex flex-wrap gap-1">
                        {data.labDirectory.slice(0, 8).map((lab) => (
                          <button
                            key={lab.id}
                            type="button"
                            onClick={() => chooseLab(lab.id)}
                            className="rounded-full border border-border bg-card px-2.5 py-1 transition-colors hover:border-primary hover:text-primary"
                          >
                            {lab.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {!selection.date || !selection.start ? (
                    <div className="space-y-2">
                      <p className="font-medium text-warning">Pick a time</p>
                      <div className="grid grid-cols-3 gap-2">
                        <Input
                          aria-label="Date"
                          type="date"
                          value={clarifyDate}
                          onChange={(event) => setClarifyDate(event.target.value)}
                        />
                        <Input
                          aria-label="Start time"
                          type="time"
                          value={clarifyStart}
                          onChange={(event) => setClarifyStart(event.target.value)}
                        />
                        <Input
                          aria-label="End time"
                          type="time"
                          value={clarifyEnd}
                          onChange={(event) => setClarifyEnd(event.target.value)}
                        />
                      </div>
                      <Button size="sm" variant="outline" onClick={applyClarifyTimes}>
                        Use this time
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="space-y-3 rounded-lg border bg-card p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Your plan</p>
                  {checking ? (
                    <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Loader2 className="size-3 animate-spin" aria-hidden />
                      Checking…
                    </span>
                  ) : null}
                </div>

                <div className="space-y-1">
                  <p className="font-medium">
                    {selection.labId ? (names[selection.labId] ?? "Lab") : "No lab yet"}
                  </p>
                  <p className="text-muted-foreground">
                    {selection.date
                      ? `${formatDay(selection.date)} · ${
                          selection.start && selection.end
                            ? formatTimeRange(selection.start, selection.end)
                            : "time TBD"
                        }`
                      : "Date not set"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {selection.purpose}
                    {selection.attendees ? ` · ${selection.attendees} attendees` : ""}
                  </p>
                </div>

                {isFree === true && withinOpenHours ? (
                  <p className="flex items-center gap-1.5 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-xs text-success">
                    <CircleCheck className="size-3.5" aria-hidden />
                    Free for the whole window.
                  </p>
                ) : null}

                {conflicts.length > 0 || withinOpenHours === false ? (
                  <div className="space-y-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2.5 text-xs">
                    {withinOpenHours === false ? (
                      <p className="flex items-start gap-1.5 text-warning">
                        <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                        Outside opening hours.
                      </p>
                    ) : null}
                    {conflicts.length > 0 ? (
                      <div className="space-y-1">
                        <p className="font-medium text-warning">Already booked:</p>
                        {conflicts.map((conflict) => (
                          <div
                            key={`${conflict.date}-${conflict.start}-${conflict.end}`}
                            className="flex items-center justify-between gap-2"
                          >
                            <span>{formatTimeRange(conflict.start, conflict.end)}</span>
                            <StatusBadge status={conflict.status} />
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {alternatives.length > 0 ? (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Free times — click to use:</p>
                    <div className="flex flex-wrap gap-1">
                      {alternatives.slice(0, 6).map((slot) => (
                        <button
                          key={`${slot.date}-${slot.start}`}
                          type="button"
                          onClick={() => chooseSlot(slot)}
                          className="rounded-full border border-border bg-card px-2.5 py-1 text-[11px] transition-colors hover:border-primary hover:text-primary"
                        >
                          {slot.date === selection.date ? "" : `${formatDay(slot.date)} `}
                          {formatTimeRange(slot.start, slot.end)}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {labPicks.length > 0 ? (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Other options:</p>
                    <div className="space-y-1">
                      {labPicks.map((pick) => (
                        <button
                          key={pick.id}
                          type="button"
                          onClick={() => chooseLab(pick.id)}
                          className="flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5 text-left text-xs transition-colors hover:border-primary"
                        >
                          <span className="truncate font-medium">{pick.name}</span>
                          <span className="shrink-0 text-muted-foreground">{pick.hint}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {equipLines.length > 0 ? (
                  <ul className="space-y-1.5 text-xs">
                    {equipLines.map((line) => (
                      <li
                        key={line.equipmentId}
                        className={cn(
                          "flex items-start justify-between gap-2",
                          line.feasible ? "text-muted-foreground" : "text-destructive",
                        )}
                      >
                        <span className="min-w-0">
                          {line.name} × {line.requestedQuantity} — {line.message}
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
                      </li>
                    ))}
                  </ul>
                ) : null}

                {data.unmatchedEquipment.map((group) => {
                  const alreadyPicked = group.candidates.some((candidate) =>
                    selection.equipment.some((line) => line.equipmentId === candidate.id),
                  );
                  if (alreadyPicked || group.candidates.length === 0) return null;
                  return (
                    <div key={group.hint} className="space-y-1 text-xs">
                      <p className="text-muted-foreground">
                        Not found: &ldquo;{group.hint}&rdquo; — did you mean:
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {group.candidates.map((candidate) => (
                          <button
                            key={candidate.id}
                            type="button"
                            onClick={() => addEquipment(candidate)}
                            className="rounded-full border border-border bg-card px-2.5 py-1 transition-colors hover:border-primary hover:text-primary"
                          >
                            {candidate.name} ({candidate.available} free)
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}

                {wizardUrl ? (
                  <Button render={<Link href={wizardUrl} onClick={() => setOpen(false)} />} className="w-full">
                    Open booking wizard
                  </Button>
                ) : (
                  <p className="text-xs text-muted-foreground">Nothing to prefill — use the form below.</p>
                )}
                <p className="text-[11px] text-muted-foreground">
                  The wizard opens with your choices prefilled; review and submit it there.
                </p>
              </div>
            </div>
          ) : null}

          <div ref={endRef} />
        </div>

        {data ? (
          <div className="space-y-2 border-t border-border p-3">
            <div className="flex gap-2">
              <Input
                value={command}
                onChange={(event) => setCommand(event.target.value)}
                placeholder="Ask for a change… e.g. same time next week"
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    runCommand(command);
                  }
                }}
              />
              <Button
                size="sm"
                disabled={pending || command.trim().length < 3}
                onClick={() => runCommand(command)}
              >
                Send
              </Button>
            </div>
            <div className="flex items-center justify-between gap-2">
              <div className="flex flex-wrap gap-1">
                {QUICK_REFINEMENTS.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    disabled={pending}
                    onClick={() => runCommand(chip)}
                    className="rounded-full border border-border bg-card px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
                  >
                    {chip}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={reset}
                className="text-[11px] text-muted-foreground transition-colors hover:text-foreground"
              >
                Start over
              </button>
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
