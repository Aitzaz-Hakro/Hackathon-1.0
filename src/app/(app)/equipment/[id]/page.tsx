import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Archive, ArrowLeft, CalendarPlus, CircleCheck, TriangleAlert, Wrench, type LucideIcon } from "lucide-react";

import { PageBody, PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { EQUIPMENT_CONDITION_TONES, MAINTENANCE_TONES, ToneBadge, titleCase } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Equipment" };

const CONDITION_ICONS: Record<string, LucideIcon> = {
  new: CircleCheck,
  good: CircleCheck,
  fair: TriangleAlert,
  damaged: Wrench,
  retired: Archive,
};

export default async function EquipmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const supabase = await createClient();

  const { data: item } = await supabase
    .from("equipment_availability")
    .select("*")
    .eq("equipment_id", id)
    .maybeSingle();

  if (!item) notFound();

  const [{ data: category }, { data: lab }] = await Promise.all([
    supabase.from("equipment_categories").select("name, description, requires_approval").eq("id", item.category_id).maybeSingle(),
    item.lab_id
      ? supabase.from("labs").select("id, name, code").eq("id", item.lab_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return (
    <PageBody>
      <div>
        <Button variant="ghost" size="sm" className="-ml-2 mb-2 text-muted-foreground" render={<Link href="/equipment" />}>
          <ArrowLeft className="size-3.5" aria-hidden />
          All equipment
        </Button>
        <PageHeader
          title={item.name}
          description={`${item.asset_code} · ${category?.name ?? "Category"}${lab ? ` · ${lab.name}` : ""}`}
          actions={
            <Button size="sm" render={<Link href={`/bookings/new?equipment=${item.equipment_id}`} />}>
              <CalendarPlus className="size-4" aria-hidden />
              Request this item
            </Button>
          }
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Available now" value={item.available_quantity} tone={item.available_quantity === 0 ? "danger" : "positive"} />
        <StatCard label="Reserved" value={item.reserved_quantity} hint="On approved bookings" />
        <StatCard label="In use" value={item.in_use_quantity} hint="Currently checked out" />
        <StatCard
          label="Damage reports"
          value={item.damage_count}
          tone={item.damage_count > 0 ? "warning" : "default"}
        />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Condition & maintenance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Condition</span>
              <ToneBadge
                tone={EQUIPMENT_CONDITION_TONES[item.condition] ?? "neutral"}
                icon={CONDITION_ICONS[item.condition]}
              >
                {titleCase(item.condition)}
              </ToneBadge>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Maintenance</span>
              <ToneBadge tone={MAINTENANCE_TONES[item.maintenance_status] ?? "neutral"}>
                <Wrench className="size-3" aria-hidden />
                {titleCase(item.maintenance_status)}
              </ToneBadge>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Total units</span>
              <span className="font-medium tabular-nums">{item.total_quantity}</span>
            </div>
            {category?.requires_approval ? (
              <p className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                This category requires staff sign-off before the request is confirmed.
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>About</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>{category?.description ?? "No category description."}</p>
            <p>
              Home lab:{" "}
              {lab ? (
                <Link href={`/labs/${lab.id}`} className="text-primary hover:underline">
                  {lab.name}
                </Link>
              ) : (
                "—"
              )}
            </p>
            <p className="text-xs">
              Availability counts approved, reserved and in-use bookings; the database re-checks at approval
              time so a race can never over-allocate.
            </p>
          </CardContent>
        </Card>
      </div>
    </PageBody>
  );
}
