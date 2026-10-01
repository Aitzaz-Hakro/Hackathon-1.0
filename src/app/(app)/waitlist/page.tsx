import type { Metadata } from "next";
import Link from "next/link";
import { Clock, Hourglass } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { PageBody, PageHeader } from "@/components/page-header";
import { ToneBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { StatusTone } from "@/lib/booking/status";
import { requireUser } from "@/lib/auth";
import { formatDay, formatTimeRange } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

import { LeaveWaitlistButton, WaitlistJoinForm } from "./waitlist-forms";

export const metadata: Metadata = { title: "Waitlist" };

const STATUS_TONES: Record<string, StatusTone> = {
  waiting: "warning",
  promoted: "success",
  expired: "neutral",
  cancelled: "neutral",
};

export default async function WaitlistPage() {
  const profile = await requireUser();
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const [{ data: entries }, { data: labs }] = await Promise.all([
    supabase
      .from("waitlist")
      .select("id, lab_id, booking_date, start_time, end_time, position, status, created_at")
      .eq("user_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.from("labs").select("id, name, code").eq("status", "available").order("name"),
  ]);

  const labNames = new Map((labs ?? []).map((lab) => [lab.id, lab.name]));
  const rows = entries ?? [];
  const active = rows.filter((entry) => entry.status === "waiting");
  const history = rows.filter((entry) => entry.status !== "waiting");

  return (
    <PageBody>
      <PageHeader
        title="Waitlist"
        description="Hold your place for a fully booked slot. When a booking is cancelled, the first person in line is notified."
        actions={
          <Button size="sm" variant="outline" render={<Link href="/labs" />}>
            Browse labs
          </Button>
        }
      />

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Hourglass className="size-4 text-muted-foreground" aria-hidden />
              Your places
            </CardTitle>
            <CardDescription>Active waitlist entries.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {active.length === 0 ? (
              <EmptyState
                icon={Hourglass}
                title="Not waiting on anything"
                description="Join from the form on the right when a lab is fully booked."
              />
            ) : (
              active.map((entry) => (
                <div
                  key={entry.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-xs"
                >
                  <div>
                    <p className="text-sm font-medium">{labNames.get(entry.lab_id) ?? "Lab"}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatDay(entry.booking_date)} · {formatTimeRange(entry.start_time, entry.end_time)} · position{" "}
                      {entry.position}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <ToneBadge tone={STATUS_TONES[entry.status] ?? "neutral"}>Waiting</ToneBadge>
                    <LeaveWaitlistButton waitlistId={entry.id} />
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Join a waitlist</CardTitle>
            <CardDescription>Use the window you actually need — overlaps are matched exactly.</CardDescription>
          </CardHeader>
          <CardContent>
            <WaitlistJoinForm labs={labs ?? []} />
          </CardContent>
        </Card>
      </div>

      {history.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="size-4 text-muted-foreground" aria-hidden />
              History
            </CardTitle>
            <CardDescription>Promoted entries open a booking window — book before someone else does.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {history.map((entry) => (
              <div
                key={entry.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm"
              >
                <div>
                  <p className="font-medium">{labNames.get(entry.lab_id) ?? "Lab"}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatDay(entry.booking_date)} · {formatTimeRange(entry.start_time, entry.end_time)}
                    {entry.booking_date < today ? " · past" : ""}
                  </p>
                </div>
                <ToneBadge tone={STATUS_TONES[entry.status] ?? "neutral"}>
                  {entry.status.charAt(0).toUpperCase() + entry.status.slice(1)}
                </ToneBadge>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </PageBody>
  );
}
