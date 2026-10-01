"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CircleCheck, Loader2, Sparkles } from "lucide-react";

import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
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
import { parseBookingRequest } from "@/lib/ai/actions";
import type { AssistantResult } from "@/lib/ai/schema";
import { formatDay, formatTimeRange } from "@/lib/format";
import { cn } from "@/lib/utils";

type AssistantState =
  | { kind: "idle" }
  | { kind: "error"; message: string }
  | { kind: "result"; data: AssistantResult };

export function BookingAssistant() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<AssistantState>({ kind: "idle" });

  function run() {
    const request = text.trim();
    if (request.length < 3 || pending) return;
    startTransition(async () => {
      const result = await parseBookingRequest(request);
      if (result.ok && result.data) setState({ kind: "result", data: result.data });
      else setState({ kind: "error", message: result.error ?? "The assistant could not handle that." });
    });
  }

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
          <div className="space-y-1.5">
            <Label htmlFor="assistant-request">Your request</Label>
            <Textarea
              id="assistant-request"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Book the Embedded Systems Lab Friday 2-4pm for 5 Arduino kits — capstone demo"
              rows={3}
              maxLength={400}
            />
          </div>
          <Button onClick={run} disabled={pending || text.trim().length < 3} className="w-full">
            {pending ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Parsing…
              </>
            ) : (
              "Parse request"
            )}
          </Button>

          {state.kind === "error" ? (
            <p
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
            >
              {state.message}
            </p>
          ) : null}

          {state.kind === "result" ? (
            <ResultCard data={state.data} onOpenWizard={() => setOpen(false)} />
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ResultCard({ data, onOpenWizard }: { data: AssistantResult; onOpenWizard: () => void }) {
  if (data.needsClarification) {
    return (
      <div className="space-y-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2.5 text-xs">
        <p className="font-medium text-warning">Need a bit more detail</p>
        <p className="text-muted-foreground">
          {data.clarificationQuestion ?? "Which resource, and when would you like it?"}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border bg-card p-3 text-sm">
      <div className="space-y-1">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Parsed</p>
        <p className="font-medium">{data.lab ? data.lab.name : "No lab matched"}</p>
        <p className="text-muted-foreground">
          {data.date
            ? `${formatDay(data.date)} · ${data.start && data.end ? formatTimeRange(data.start, data.end) : "time TBD"}`
            : "Date not understood"}
        </p>
        <p className="text-xs text-muted-foreground">
          {data.purpose}
          {data.attendees ? ` · ${data.attendees} attendees` : ""}
        </p>
      </div>

      {!data.lab && data.labCandidates.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          Closest labs: {data.labCandidates.map((lab) => lab.name).join(", ")}
        </p>
      ) : null}

      {data.isFree === true && data.withinOpenHours ? (
        <p className="flex items-center gap-1.5 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-xs text-success">
          <CircleCheck className="size-3.5" aria-hidden />
          Free for the whole window.
        </p>
      ) : null}

      {data.conflicts.length > 0 || data.withinOpenHours === false ? (
        <div className="space-y-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2.5 text-xs">
          {data.withinOpenHours === false ? <p className="text-warning">Outside opening hours.</p> : null}
          {data.conflicts.length > 0 ? (
            <div className="space-y-1">
              <p className="font-medium text-warning">Already booked:</p>
              {data.conflicts.map((conflict) => (
                <div key={`${conflict.start}-${conflict.end}`} className="flex items-center justify-between gap-2">
                  <span>{formatTimeRange(conflict.start, conflict.end)}</span>
                  <StatusBadge status={conflict.status} />
                </div>
              ))}
            </div>
          ) : null}
          {data.alternatives.length > 0 ? (
            <p className="text-muted-foreground">
              Free times:{" "}
              {data.alternatives
                .slice(0, 4)
                .map((slot) => formatTimeRange(slot.start, slot.end))
                .join(", ")}
            </p>
          ) : null}
        </div>
      ) : null}

      {data.equipment.length > 0 ? (
        <ul className="space-y-1 text-xs">
          {data.equipment.map((line) => (
            <li
              key={line.equipmentId}
              className={cn(line.feasible ? "text-muted-foreground" : "text-destructive")}
            >
              {line.name} × {line.requestedQuantity} — {line.message}
            </li>
          ))}
        </ul>
      ) : null}

      {data.unmatchedEquipment.length > 0 ? (
        <p className="text-xs text-muted-foreground">Not found: {data.unmatchedEquipment.join(", ")}</p>
      ) : null}

      {data.wizardUrl ? (
        <Button render={<Link href={data.wizardUrl} onClick={onOpenWizard} />} className="w-full">
          Open booking wizard
        </Button>
      ) : (
        <p className="text-xs text-muted-foreground">Nothing to prefill — use the form below.</p>
      )}
      <p className="text-[11px] text-muted-foreground">
        The wizard opens prefilled; review and submit it there.
      </p>
    </div>
  );
}
