import type { Metadata } from "next";
import Link from "next/link";
import {
  Ban,
  CalendarCheck2,
  CircleCheck,
  FlaskConical,
  MapPin,
  Search,
  SlidersHorizontal,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { PageBody, PageHeader } from "@/components/page-header";
import { LAB_STATUS_TONES, ToneBadge, titleCase } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Labs" };

const LAB_STATUS_ICONS: Record<string, LucideIcon> = {
  available: CircleCheck,
  reserved: CalendarCheck2,
  in_use: CalendarCheck2,
  maintenance: Wrench,
  closed: Ban,
};

export default async function LabsPage({
  searchParams,
}: {
  searchParams: Promise<{ department?: string; q?: string; minCapacity?: string; facility?: string }>;
}) {
  await requireUser();
  const params = await searchParams;
  const supabase = await createClient();

  const [{ data: departments }, { data: labs }] = await Promise.all([
    supabase.from("departments").select("id, name, code").order("name"),
    supabase.from("labs").select("*").order("name"),
  ]);

  const departmentNames = new Map((departments ?? []).map((department) => [department.id, department.name]));

  const query = (params.q ?? "").trim().toLowerCase();
  const facility = (params.facility ?? "").trim().toLowerCase();
  const minCapacity = Number.parseInt(params.minCapacity ?? "", 10);

  const filtered = (labs ?? []).filter((lab) => {
    if (params.department && lab.department_id !== params.department) return false;
    if (Number.isFinite(minCapacity) && lab.capacity < minCapacity) return false;
    if (facility && !lab.facilities.some((item) => item.toLowerCase().includes(facility))) return false;
    if (query) {
      const haystack = `${lab.name} ${lab.code} ${lab.location}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });

  return (
    <PageBody>
      <PageHeader
        title="Labs"
        description="Browse capacity, facilities and opening hours across every department."
        actions={
          <Button size="sm" render={<Link href="/bookings/new" />}>
            New booking
          </Button>
        }
      />

      <form className="grid gap-2 rounded-xl border border-border bg-card p-3 shadow-xs sm:grid-cols-[1fr_180px_140px_160px_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="Search name, code or location"
            className="pl-9"
            aria-label="Search labs"
          />
        </div>
        <NativeSelect name="department" defaultValue={params.department ?? ""} aria-label="Department">
          <option value="">All departments</option>
          {(departments ?? []).map((department) => (
            <option key={department.id} value={department.id}>
              {department.code} — {department.name}
            </option>
          ))}
        </NativeSelect>
        <Input
          name="minCapacity"
          type="number"
          min={0}
          defaultValue={params.minCapacity ?? ""}
          placeholder="Min capacity"
          aria-label="Minimum capacity"
        />
        <Input
          name="facility"
          defaultValue={params.facility ?? ""}
          placeholder="Facility, e.g. GPU"
          aria-label="Facility"
        />
        <Button type="submit" variant="secondary">
          <SlidersHorizontal className="size-4" aria-hidden />
          Filter
        </Button>
      </form>

      <p className="text-xs text-muted-foreground">
        Showing <span className="font-medium text-foreground tabular-nums">{filtered.length}</span> of{" "}
        <span className="tabular-nums">{labs?.length ?? 0}</span> labs
      </p>

      {filtered.length === 0 ? (
        <EmptyState
          icon={FlaskConical}
          title="No labs match those filters"
          description="Try clearing the facility or lowering the minimum capacity."
          action={
            <Button variant="outline" size="sm" render={<Link href="/labs" />}>
              Clear filters
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((lab) => (
            <Link key={lab.id} href={`/labs/${lab.id}`} className="group">
              <Card className="h-full transition-[transform,border-color,box-shadow] duration-200 ease-out group-hover:-translate-y-0.5 group-hover:border-primary/30 group-hover:shadow-soft">
                <CardContent className="space-y-3">
                  <div className="flex items-start gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <FlaskConical className="size-4" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{lab.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {lab.code} · {departmentNames.get(lab.department_id) ?? "Department"}
                      </p>
                    </div>
                    <ToneBadge
                      tone={LAB_STATUS_TONES[lab.status] ?? "neutral"}
                      icon={LAB_STATUS_ICONS[lab.status]}
                    >
                      {titleCase(lab.status)}
                    </ToneBadge>
                  </div>

                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Users className="size-3.5" aria-hidden />
                      {lab.capacity} seats
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="size-3.5" aria-hidden />
                      {lab.location || "—"}
                    </span>
                  </div>

                  {lab.facilities.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {lab.facilities.slice(0, 3).map((item) => (
                        <span
                          key={item}
                          className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
                        >
                          {item}
                        </span>
                      ))}
                      {lab.facilities.length > 3 ? (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                          +{lab.facilities.length - 3}
                        </span>
                      ) : null}
                    </div>
                  ) : null}

                  <p className="text-xs text-muted-foreground">
                    Open {lab.open_time.slice(0, 5)}–{lab.close_time.slice(0, 5)}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </PageBody>
  );
}
