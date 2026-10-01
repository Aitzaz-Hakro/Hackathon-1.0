import type { Metadata } from "next";

import { BookingAssistant } from "@/components/booking-assistant";
import { PageBody, PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

import { BookingWizard } from "./booking-wizard";

export const metadata: Metadata = { title: "New booking" };

export default async function NewBookingPage({
  searchParams,
}: {
  searchParams: Promise<{ lab?: string; equipment?: string }>;
}) {
  await requireUser();
  const params = await searchParams;
  const supabase = await createClient();

  const [{ data: labs }, { data: equipment }, { data: categories }] = await Promise.all([
    supabase
      .from("labs")
      .select("id, name, code, capacity, department_id, facilities, open_time, close_time, status")
      .eq("status", "available")
      .order("name"),
    supabase.from("equipment_availability").select("*").gt("total_quantity", 0).order("name"),
    supabase.from("equipment_categories").select("id, name"),
  ]);

  const categoryNames = new Map((categories ?? []).map((category) => [category.id, category.name]));

  const equipmentOptions = (equipment ?? []).map((item) => ({
    id: item.equipment_id,
    name: item.name,
    assetCode: item.asset_code,
    categoryName: categoryNames.get(item.category_id) ?? "Category",
    labId: item.lab_id,
    available: item.available_quantity,
    total: item.total_quantity,
    maintenanceStatus: item.maintenance_status,
  }));

  return (
    <PageBody className="relative isolate">
      <div aria-hidden className="bg-mesh pointer-events-none absolute -inset-x-4 -top-4 -z-10 h-64 lg:-inset-x-8 lg:-top-8" />
      <PageHeader
        title="New booking"
        description="Pick a resource, choose a time, and the system checks availability before you submit."
        actions={<BookingAssistant />}
      />
      <BookingWizard
        key={`${params.lab ?? ""}:${params.equipment ?? ""}`}
        labs={labs ?? []}
        equipment={equipmentOptions}
        initialLabId={params.lab ?? null}
        initialEquipmentId={params.equipment ?? null}
      />
    </PageBody>
  );
}
