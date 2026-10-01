import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Ban,
  CalendarCheck2,
  CalendarPlus,
  CircleCheck,
  Clock,
  MapPin,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import { AvailabilityTimeline, TimelineLegend } from "@/components/availability-timeline";
import { ActionForm } from "@/components/action-form";
import { EmptyState } from "@/components/empty-state";
import { PageBody, PageHeader } from "@/components/page-header";
import { LAB_STATUS_TONES, ToneBadge, titleCase } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/native-select";
import { setLabStatus } from "@/lib/actions/admin";
import { addDays } from "@/lib/booking/availability";
import { isStaffRole, requireUser } from "@/lib/auth";
import { formatDay } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Lab" };

const LAB_STATUS_ICONS: Record<string, LucideIcon> = {
  available: CircleCheck,
  reserved: CalendarCheck2,
  in_use: CalendarCheck2,
  maintenance: Wrench,
  closed: Ban,
};

export default async function LabDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const profile = await requireUser();
  const { id } = await params;
  const { date: dateParam } = await searchParams;

  const today = new Date().toISOString().slice(0, 10);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dateParam ?? "") ? (dateParam as string) : today;

  const supabase = await createClient();
  const { data: lab } = await supabase.from("labs").select("*").eq("id", id).maybeSingle();

  if (!lab) notFound();

  const [{ data: department }, { data: slots }] = await Promise.all([
    supabase.from("departments").select("name, code").eq("id", lab.department_id).maybeSingle(),
    supabase
      .from("lab_busy_slots")
      .select("start_time, end_time, booking_status")
      .eq("lab_id", lab.id)
      .eq("booking_date", date)
      .order("start_time"),
  ]);

  const blocks = (slots ?? []).map((slot) => ({
    start: slot.start_time,
    end: slot.end_time,
    status: slot.booking_status,
  }));

  return (
    <PageBody>
      <div>
        <Button variant="ghost" size="sm" className="-ml-2 mb-2 text-muted-foreground" render={<Link href="/labs" />}>
          <ArrowLeft className="size-3.5" aria-hidden />
          All labs
        </Button>
        <PageHeader
          title={lab.name}
          description={`${lab.code} · ${department?.name ?? "Department"} · ${lab.location || "No location set"}`}
          actions={
            <>
              <ToneBadge tone={LAB_STATUS_TONES[lab.status] ?? "neutral"} icon={LAB_STATUS_ICONS[lab.status]}>
                {titleCase(lab.status)}
              </ToneBadge>
              <Button size="sm" render={<Link href={`/bookings/new?lab=${lab.id}`} />}>
                <CalendarPlus className="size-4" aria-hidden />
                Book this lab
              </Button>
            </>
          }
        />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="size-4 text-muted-foreground" aria-hidden />
              Availability
            </CardTitle>
            <CardDescription>{formatDay(date)} — committed intervals for this lab.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {blocks.length === 0 ? (
              <EmptyState
                icon={Clock}
                title="Nothing booked that day"
                description="The whole day is open — pick any slot within opening hours."
                action={
                  <Button size="sm" render={<Link href={`/bookings/new?lab=${lab.id}`} />}>
                    Request this day
                  </Button>
                }
              />
            ) : (
              <AvailabilityTimeline
                openTime={lab.open_time.slice(0, 5)}
                closeTime={lab.close_time.slice(0, 5)}
                blocks={blocks}
              />
            )}

            {blocks.length > 0 ? <TimelineLegend /> : null}

            <div className="flex items-center justify-between gap-2 border-t border-border pt-4">
              <Button
                variant="outline"
                size="sm"
                render={<Link href={`/labs/${lab.id}?date=${addDays(date, -1)}`} />}
              >
                <ArrowLeft className="size-3.5" aria-hidden />
                Previous
              </Button>
              <span className="text-sm font-medium">{formatDay(date)}</span>
              <Button
                variant="outline"
                size="sm"
                render={<Link href={`/labs/${lab.id}?date=${addDays(date, 1)}`} />}
              >
                Next
                <ArrowRight className="size-3.5" aria-hidden />
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Users className="size-4" aria-hidden />
              Seats up to <span className="font-medium text-foreground">{lab.capacity}</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Clock className="size-4" aria-hidden />
              Opens <span className="font-medium text-foreground">{lab.open_time.slice(0, 5)}</span> — closes{" "}
              <span className="font-medium text-foreground">{lab.close_time.slice(0, 5)}</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <MapPin className="size-4" aria-hidden />
              {lab.location || "—"}
            </div>

            {lab.facilities.length > 0 ? (
              <div>
                <p className="mb-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Facilities
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {lab.facilities.map((facility) => (
                    <span
                      key={facility}
                      className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground"
                    >
                      {facility}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            {lab.description ? <p className="text-muted-foreground">{lab.description}</p> : null}

            {isStaffRole(profile.role) ? (
              <div className="border-t pt-4">
                <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Staff controls
                </p>
                <ActionForm
                  action={setLabStatus}
                  submitLabel="Update"
                  className="flex items-center gap-2 space-y-0"
                >
                  <input type="hidden" name="labId" value={lab.id} />
                  <NativeSelect name="status" defaultValue={lab.status} className="w-36" aria-label="Lab status">
                    {(["available", "reserved", "in_use", "maintenance", "closed"] as const).map((status) => (
                      <option key={status} value={status}>
                        {titleCase(status)}
                      </option>
                    ))}
                  </NativeSelect>
                </ActionForm>
                <p className="mt-2 text-xs text-muted-foreground">
                  Set the lab to maintenance or closed to block new bookings.
                </p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </PageBody>
  );
}
