import type { Metadata } from "next";
import Link from "next/link";
import {
  Archive,
  Boxes,
  CircleCheck,
  Microscope,
  Search,
  SlidersHorizontal,
  TriangleAlert,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { PageBody, PageHeader } from "@/components/page-header";
import { EQUIPMENT_CONDITION_TONES, MAINTENANCE_TONES, ToneBadge, titleCase } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Equipment" };

const CONDITION_ICONS: Record<string, LucideIcon> = {
  new: CircleCheck,
  good: CircleCheck,
  fair: TriangleAlert,
  damaged: Wrench,
  retired: Archive,
};

export default async function EquipmentPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; q?: string; available?: string }>;
}) {
  await requireUser();
  const params = await searchParams;
  const supabase = await createClient();

  const [{ data: categories }, { data: labs }, { data: equipment }] = await Promise.all([
    supabase.from("equipment_categories").select("id, name").order("name"),
    supabase.from("labs").select("id, name").order("name"),
    supabase.from("equipment_availability").select("*").order("name"),
  ]);

  const categoryNames = new Map((categories ?? []).map((category) => [category.id, category.name]));
  const labNames = new Map((labs ?? []).map((lab) => [lab.id, lab.name]));

  const query = (params.q ?? "").trim().toLowerCase();
  const onlyAvailable = params.available === "1";

  const filtered = (equipment ?? []).filter((item) => {
    if (params.category && item.category_id !== params.category) return false;
    if (onlyAvailable && item.available_quantity <= 0) return false;
    if (query) {
      const haystack = `${item.name} ${item.asset_code}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });

  return (
    <PageBody>
      <PageHeader
        title="Equipment"
        description="Live availability across every category and lab."
        actions={
          <Button size="sm" render={<Link href="/bookings/new" />}>
            New booking
          </Button>
        }
      />

      <form className="grid gap-2 rounded-xl border border-border bg-card p-3 shadow-xs sm:grid-cols-[1fr_200px_150px_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="Search name or asset code"
            className="pl-9"
            aria-label="Search equipment"
          />
        </div>
        <NativeSelect name="category" defaultValue={params.category ?? ""} aria-label="Category">
          <option value="">All categories</option>
          {(categories ?? []).map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </NativeSelect>
        <label className="flex h-9 items-center gap-2 rounded-lg border border-input px-3 text-sm">
          <input
            type="checkbox"
            name="available"
            value="1"
            defaultChecked={onlyAvailable}
            className="size-4 accent-primary"
          />
          In stock only
        </label>
        <Button type="submit" variant="secondary">
          <SlidersHorizontal className="size-4" aria-hidden />
          Filter
        </Button>
      </form>

      <p className="text-xs text-muted-foreground">
        Showing <span className="font-medium text-foreground tabular-nums">{filtered.length}</span> of{" "}
        <span className="tabular-nums">{equipment?.length ?? 0}</span> items
      </p>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title="No equipment matches those filters"
          description="Try a different category or clear the search."
          action={
            <Button variant="outline" size="sm" render={<Link href="/equipment" />}>
              Clear filters
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((item) => {
            const scarce = item.available_quantity === 0;
            return (
              <Link key={item.equipment_id} href={`/equipment/${item.equipment_id}`} className="group">
                <Card className="h-full transition-[transform,border-color,box-shadow] duration-200 ease-out group-hover:-translate-y-0.5 group-hover:border-primary/30 group-hover:shadow-soft">
                  <CardContent className="space-y-3">
                    <div className="flex items-start gap-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Microscope className="size-4" aria-hidden />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{item.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.asset_code} · {categoryNames.get(item.category_id) ?? "Category"}
                        </p>
                      </div>
                      <ToneBadge
                        tone={EQUIPMENT_CONDITION_TONES[item.condition] ?? "neutral"}
                        icon={CONDITION_ICONS[item.condition]}
                      >
                        {titleCase(item.condition)}
                      </ToneBadge>
                    </div>

                    <div className="flex items-end justify-between gap-2">
                      <div>
                        <p
                          className={cn(
                            "text-2xl font-semibold tracking-tight tabular-nums",
                            scarce ? "text-destructive" : "text-success",
                          )}
                        >
                          {item.available_quantity}
                          <span className="text-sm font-normal text-muted-foreground"> / {item.total_quantity}</span>
                        </p>
                        <p className="flex items-center gap-1 text-xs text-muted-foreground">
                          {scarce ? (
                            <TriangleAlert className="size-3.5 text-destructive" aria-hidden />
                          ) : (
                            <CircleCheck className="size-3.5 text-success" aria-hidden />
                          )}
                          {scarce ? "None available" : "available now"}
                        </p>
                      </div>
                      {item.maintenance_status !== "operational" ? (
                        <ToneBadge
                          tone={MAINTENANCE_TONES[item.maintenance_status] ?? "warning"}
                          icon={Wrench}
                        >
                          {titleCase(item.maintenance_status)}
                        </ToneBadge>
                      ) : null}
                    </div>

                    <p className="text-xs text-muted-foreground">
                      {item.lab_id ? (labNames.get(item.lab_id) ?? "Lab") : "No home lab"}
                      {item.damage_count > 0 ? ` · ${item.damage_count} damage report${item.damage_count === 1 ? "" : "s"}` : ""}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </PageBody>
  );
}
