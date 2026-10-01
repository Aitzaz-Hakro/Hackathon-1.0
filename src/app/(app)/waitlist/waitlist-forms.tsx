"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { joinWaitlist, leaveWaitlist } from "@/lib/actions/waitlist";
import { addDays } from "@/lib/booking/availability";

export function WaitlistJoinForm({
  labs,
}: {
  labs: Array<{ id: string; name: string; code: string }>;
}) {
  const [state, formAction, pending] = useActionState(joinWaitlist, null);
  const tomorrow = addDays(new Date().toISOString().slice(0, 10), 1);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="waitlist-lab">Lab</Label>
        <NativeSelect id="waitlist-lab" name="labId" required defaultValue={labs[0]?.id ?? ""}>
          {labs.map((lab) => (
            <option key={lab.id} value={lab.id}>
              {lab.name} ({lab.code})
            </option>
          ))}
        </NativeSelect>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="waitlist-date">Date</Label>
          <Input id="waitlist-date" name="date" type="date" defaultValue={tomorrow} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="waitlist-start">Start</Label>
          <Input id="waitlist-start" name="start" type="time" defaultValue="09:00" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="waitlist-end">End</Label>
          <Input id="waitlist-end" name="end" type="time" defaultValue="11:00" required />
        </div>
      </div>

      {state?.error ? (
        <p role="alert" className="text-xs text-destructive">
          {state.error}
        </p>
      ) : null}
      {state?.ok && state.message ? (
        <p role="status" className="text-xs text-success">
          {state.message}
        </p>
      ) : null}

      <Button type="submit" size="sm" disabled={pending || labs.length === 0}>
        {pending ? "Joining…" : "Join the waitlist"}
      </Button>
    </form>
  );
}

export function LeaveWaitlistButton({ waitlistId }: { waitlistId: string }) {
  const [state, formAction, pending] = useActionState(leaveWaitlist, null);

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="waitlistId" value={waitlistId} />
      {state?.error ? (
        <span role="alert" className="text-xs text-destructive">
          {state.error}
        </span>
      ) : null}
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {pending ? "Leaving…" : "Leave"}
      </Button>
    </form>
  );
}
