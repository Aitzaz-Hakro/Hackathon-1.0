import type { Metadata } from "next";
import Link from "next/link";
import QRCode from "qrcode";
import { PackageCheck, QrCode, ScanLine, Search, TriangleAlert } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { PageBody, PageHeader } from "@/components/page-header";
import { ToneBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { STAFF_ROLES, requireRole } from "@/lib/auth";
import { formatDateTime, formatDay, formatTimeRange } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Scan" };

export default async function ScanPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  await requireRole(STAFF_ROLES);
  const params = await searchParams;
  const code = params.code?.trim().toUpperCase() ?? "";
  const supabase = await createClient();

  let issue: {
    id: string;
    booking_id: string;
    equipment_id: string;
    quantity: number;
    checkout_code: string;
    issued_at: string | null;
    due_at: string | null;
    returned_at: string | null;
  } | null = null;
  let equipmentName = "";
  let bookingLabel = "";
  let qrDataUrl: string | null = null;

  if (code) {
    const { data } = await supabase
      .from("issues")
      .select("id, booking_id, equipment_id, quantity, checkout_code, issued_at, due_at, returned_at")
      .eq("checkout_code", code)
      .maybeSingle();

    if (data) {
      issue = data;

      const [{ data: equipment }, { data: booking }] = await Promise.all([
        supabase.from("equipment").select("name").eq("id", data.equipment_id).maybeSingle(),
        supabase
          .from("bookings")
          .select("booking_date, start_time, end_time")
          .eq("id", data.booking_id)
          .maybeSingle(),
      ]);

      equipmentName = equipment?.name ?? "Item";
      bookingLabel = booking
        ? `${formatDay(booking.booking_date)} · ${formatTimeRange(booking.start_time, booking.end_time)}`
        : "";

      // Generated server-side, handed down as a data URL string.
      qrDataUrl = await QRCode.toDataURL(data.checkout_code, { width: 220, margin: 1 });
    }
  }

  const { data: openIssues } = await supabase
    .from("issues")
    .select("id, checkout_code, equipment_id, quantity, due_at")
    .is("returned_at", null)
    .order("due_at", { ascending: true })
    .limit(12);

  const equipmentIds = Array.from(new Set((openIssues ?? []).map((entry) => entry.equipment_id)));
  const equipmentNames =
    equipmentIds.length > 0
      ? new Map(
          ((await supabase.from("equipment").select("id, name").in("id", equipmentIds)).data ?? []).map(
            (item) => [item.id, item.name],
          ),
        )
      : new Map<string, string>();

  const now = new Date().toISOString();

  return (
    <PageBody>
      <PageHeader
        title="Scan & lookup"
        description="Enter a checkout code to pull up an issue, or scan its QR label."
      />

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ScanLine className="size-4 text-muted-foreground" aria-hidden />
              Code lookup
            </CardTitle>
            <CardDescription>
              Manual entry is the primary path — camera scanning needs a Chromium-based browser.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form className="flex gap-2">
              <div className="relative flex-1">
                <QrCode
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  name="code"
                  defaultValue={code}
                  placeholder="LAB-XXXXXX"
                  aria-label="Checkout code"
                  className="pl-9 font-mono uppercase"
                />
              </div>
              <Button type="submit" variant="secondary">
                <Search className="size-4" aria-hidden />
                Look up
              </Button>
            </form>

            {code && !issue ? (
              <p className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                No issue found for “{code}”.
              </p>
            ) : null}

            {issue && qrDataUrl ? (
              <div className="space-y-4 rounded-xl border border-border bg-muted/30 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{equipmentName}</p>
                    <p className="text-xs text-muted-foreground">
                      Quantity {issue.quantity} · {bookingLabel}
                    </p>
                  </div>
                  {issue.returned_at ? (
                    <ToneBadge tone="success">Returned</ToneBadge>
                  ) : issue.due_at && issue.due_at < now ? (
                    <ToneBadge tone="danger">Overdue</ToneBadge>
                  ) : (
                    <ToneBadge tone="info">Checked out</ToneBadge>
                  )}
                </div>

                <div className="flex items-center gap-4">
                  {/* Local data URL from the server — next/image adds nothing here. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={qrDataUrl}
                    alt={`QR code for ${issue.checkout_code}`}
                    className="size-32 rounded-xl border border-border bg-white p-2"
                  />
                  <div className="min-w-0 text-sm">
                    <code className="rounded-md border bg-background px-2 py-1 font-mono text-xs">
                      {issue.checkout_code}
                    </code>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Issued {issue.issued_at ? formatDateTime(issue.issued_at) : "—"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Due {issue.due_at ? formatDateTime(issue.due_at) : "—"}
                    </p>
                    <Link
                      href={`/bookings/${issue.booking_id}`}
                      className="mt-2 inline-block text-xs text-primary hover:underline"
                    >
                      Open the booking
                    </Link>
                  </div>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PackageCheck className="size-4 text-muted-foreground" aria-hidden />
              Open checkouts
            </CardTitle>
            <CardDescription>Codes you can pull up for a quick return.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {(openIssues ?? []).length === 0 ? (
              <EmptyState
                icon={PackageCheck}
                title="Nothing checked out"
                description="Issued equipment appears here with a code and a QR label."
              />
            ) : (
              (openIssues ?? []).map((entry) => (
                <Link
                  key={entry.id}
                  href={`/scan?code=${entry.checkout_code}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm shadow-xs transition-colors duration-150 hover:border-primary/30"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">
                      {equipmentNames.get(entry.equipment_id) ?? "Item"} × {entry.quantity}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Due {entry.due_at ? formatDateTime(entry.due_at) : "—"}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <code className="font-mono text-xs text-muted-foreground">{entry.checkout_code}</code>
                    <QrCode className="size-4 text-muted-foreground" aria-hidden />
                  </span>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </PageBody>
  );
}
