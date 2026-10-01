"use client";

import { useActionState, useState } from "react";
import { CircleCheck, CircleX, Loader2, QrCode } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { approveBooking, rejectBooking } from "@/lib/actions/approvals";
import { cancelBooking } from "@/lib/actions/bookings";
import { issueBooking } from "@/lib/actions/issues";

/** Inline cancel flow: a small confirm form, hidden until requested. */
export function CancelBookingForm({ bookingId }: { bookingId: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(cancelBooking, null);

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Cancel booking
      </Button>
    );
  }

  return (
    <form action={formAction} className="space-y-2 rounded-lg border bg-card p-3">
      <input type="hidden" name="bookingId" value={bookingId} />
      <div className="space-y-1.5">
        <Label htmlFor={`cancel-reason-${bookingId}`}>Reason (optional)</Label>
        <Input id={`cancel-reason-${bookingId}`} name="reason" placeholder="e.g. session moved" />
      </div>
      {state?.error ? (
        <p role="alert" className="text-xs text-destructive">
          {state.error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" variant="destructive" size="sm" disabled={pending}>
          {pending ? "Cancelling…" : "Confirm cancellation"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Keep it
        </Button>
      </div>
    </form>
  );
}

/** Approve / reject controls for the staff queue and booking detail. */
export function DecisionActions({ bookingId }: { bookingId: string }) {
  const [approveState, approveAction, approving] = useActionState(approveBooking, null);
  const [rejectState, rejectAction, rejecting] = useActionState(rejectBooking, null);
  const [showReject, setShowReject] = useState(false);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <form action={approveAction}>
          <input type="hidden" name="bookingId" value={bookingId} />
          <Button type="submit" size="sm" disabled={approving || rejecting}>
            {approving ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <CircleCheck className="size-3.5" aria-hidden />
            )}
            {approving ? "Approving…" : "Approve"}
          </Button>
        </form>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={approving || rejecting}
          onClick={() => setShowReject((value) => !value)}
        >
          <CircleX className="size-3.5" aria-hidden />
          Reject
        </Button>
      </div>

      {approveState?.error ? (
        <p role="alert" className="text-xs text-destructive">
          {approveState.error}
        </p>
      ) : null}

      {showReject ? (
        <form action={rejectAction} className="space-y-2 rounded-lg border bg-card p-3">
          <input type="hidden" name="bookingId" value={bookingId} />
          <div className="space-y-1.5">
            <Label htmlFor={`reject-reason-${bookingId}`}>Reason for rejection</Label>
            <Input
              id={`reject-reason-${bookingId}`}
              name="reason"
              placeholder="e.g. lab reserved for scheduled coursework"
              required
              minLength={3}
            />
          </div>
          {rejectState?.error ? (
            <p role="alert" className="text-xs text-destructive">
              {rejectState.error}
            </p>
          ) : null}
          <Button type="submit" variant="destructive" size="sm" disabled={rejecting}>
            {rejecting ? "Rejecting…" : "Confirm rejection"}
          </Button>
        </form>
      ) : null}
    </div>
  );
}

/** Hand out equipment / open the session for an approved booking. */
export function IssueBookingButton({
  bookingId,
  label = "Issue / check out",
}: {
  bookingId: string;
  label?: string;
}) {
  const [state, formAction, pending] = useActionState(issueBooking, null);

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="bookingId" value={bookingId} />
      {state?.error ? (
        <p role="alert" className="text-xs text-destructive">
          {state.error}
        </p>
      ) : null}
      {state?.ok && state.message && !state.error ? (
        <p role="status" className="text-xs text-success">
          {state.message}
        </p>
      ) : null}
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? (
          "Issuing…"
        ) : (
          <>
            <QrCode className="size-3.5" aria-hidden />
            {label}
          </>
        )}
      </Button>
    </form>
  );
}
