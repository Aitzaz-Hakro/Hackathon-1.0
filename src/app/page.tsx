import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  CalendarClock,
  CircleCheck,
  ClipboardCheck,
  FlaskConical,
  GraduationCap,
  PackageCheck,
  QrCode,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Wrench,
} from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Public landing page.
 *
 * Also the entry point for judges: states the problem, shows the workflow the
 * rulebook specifies, and gets out of the way.
 */

const FLOW = [
  { label: "Search resource", icon: Search },
  { label: "Check availability", icon: CalendarClock },
  { label: "Submit request", icon: Send },
  { label: "Approval", icon: ShieldCheck },
  { label: "Reservation", icon: BadgeCheck },
  { label: "Usage & return", icon: PackageCheck },
  { label: "Analytics updated", icon: BarChart3 },
];

const FEATURES = [
  {
    icon: ShieldCheck,
    title: "Conflict prevention",
    body: "Overlapping bookings are rejected before they are written, and a database constraint makes double-booking impossible even under a race.",
  },
  {
    icon: Sparkles,
    title: "Smart recommendations",
    body: "When a lab is taken, alternatives are ranked by capacity fit, facilities, department and how lightly booked they are — each with a match score.",
  },
  {
    icon: PackageCheck,
    title: "Issue and return tracking",
    body: "Every unit is tracked from checkout to return, with due dates, late flags, condition reporting and damage images.",
  },
  {
    icon: ClipboardCheck,
    title: "Approval workflow",
    body: "Requests are scored by urgency, role and purpose so staff review what matters first instead of in submission order.",
  },
  {
    icon: BarChart3,
    title: "Usage analytics",
    body: "Peak hours, most-booked labs, underused rooms, damage reports and a department usage heatmap.",
  },
  {
    icon: QrCode,
    title: "QR checkout",
    body: "Each issue gets a scannable code for fast checkout and return, with manual entry when a camera is not available.",
  },
];

const ROLES = [
  {
    name: "Student & Faculty",
    icon: GraduationCap,
    points: [
      "Browse labs and equipment",
      "Check live availability",
      "Submit and track requests",
      "View booking history",
    ],
  },
  {
    name: "Lab Staff",
    icon: Wrench,
    points: [
      "Approve or reject requests",
      "Issue and receive equipment",
      "Record damage and late returns",
      "Block resources for maintenance",
    ],
  },
  {
    name: "Coordinator & Admin",
    icon: BarChart3,
    points: [
      "Define booking rules",
      "Manage labs and departments",
      "Monitor resource usage",
      "Resolve booking conflicts",
    ],
  },
];

const PREVIEW_ROWS = [
  { name: "Electronics", blocks: [{ left: "8%", width: "20%", tone: "bg-info/70" }, { left: "44%", width: "26%", tone: "bg-violet/70" }] },
  { name: "Chemistry", blocks: [{ left: "24%", width: "30%", tone: "bg-info/70" }] },
  { name: "Fabrication", blocks: [{ left: "58%", width: "22%", tone: "bg-warning/70" }] },
];

export default function LandingPage() {
  return (
    <div className="flex flex-1 flex-col">
      <div className="relative">
        {/* Faint mesh behind the header + hero so the glass can sit on something. */}
        <div aria-hidden className="bg-mesh pointer-events-none absolute inset-x-0 top-0 h-[34rem]" />

        <header className="glass sticky top-0 z-40 border-b border-border/60">
          <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
            <Link href="/" className="flex items-center gap-2.5 font-semibold">
              <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <FlaskConical className="size-4" aria-hidden />
              </span>
              Lab Reserve
            </Link>
            <nav className="flex items-center gap-2">
              <Button variant="ghost" size="sm" render={<Link href="/login" />}>
                Sign in
              </Button>
              <Button size="sm" render={<Link href="/signup" />}>
                Create account
              </Button>
            </nav>
          </div>
        </header>

        <section className="relative mx-auto grid w-full max-w-6xl items-center gap-12 px-6 pt-16 pb-20 lg:grid-cols-[1.05fr_0.95fr] lg:pt-20">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
              <Sparkles className="size-3" aria-hidden />
              University resource management
            </span>
            <h1 className="mt-6 text-2xl leading-tight font-semibold tracking-tight sm:text-[2rem] sm:leading-[1.15]">
              One place for every lab booking and piece of equipment.
            </h1>
            <p className="mt-5 max-w-xl text-pretty text-muted-foreground">
              Paper forms and WhatsApp requests cause double bookings, missing gear and approvals
              that never arrive. Lab Reserve replaces them with a single system for availability,
              approval, issue and return — backed by real usage data.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button size="lg" render={<Link href="/login" />}>
                Sign in to demo
                <ArrowRight className="size-4" aria-hidden />
              </Button>
              <Button size="lg" variant="outline" render={<Link href="/signup" />}>
                Create an account
              </Button>
            </div>
            <p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <CircleCheck className="size-3.5 text-success" aria-hidden />
                Conflict-free by construction
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CircleCheck className="size-3.5 text-success" aria-hidden />
                Five seeded demo roles
              </span>
            </p>
          </div>

          {/* Product preview — decorative, hence aria-hidden. */}
          <div className="glass relative rounded-2xl border p-5" aria-hidden>
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium">Availability — Robotics Lab</p>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-success/20 bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
                <CircleCheck className="size-3" />
                Open now
              </span>
            </div>

            <div className="mt-5 space-y-3">
              {PREVIEW_ROWS.map((row) => (
                <div key={row.name} className="flex items-center gap-3">
                  <span className="w-20 shrink-0 truncate text-xs text-muted-foreground">{row.name}</span>
                  <div className="relative h-6 flex-1 rounded-md bg-muted">
                    {row.blocks.map((block, index) => (
                      <span
                        key={index}
                        className={`absolute inset-y-1 rounded ${block.tone}`}
                        style={{ left: block.left, width: block.width }}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-border/60 pt-3 text-xs text-muted-foreground">
              <span className="tabular-nums">09:00 — 18:00</span>
              <span className="inline-flex items-center gap-1 text-primary">
                <Sparkles className="size-3" />
                3 alternatives suggested
              </span>
            </div>
          </div>
        </section>
      </div>

      <section className="border-y border-border bg-card">
        <div className="mx-auto w-full max-w-6xl px-6 py-10">
          <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">The complete flow</p>
          <ol className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-4 lg:grid-cols-7">
            {FLOW.map((step, index) => (
              <li key={step.label} className="flex flex-col gap-2 bg-card p-4">
                <div className="flex items-center justify-between">
                  <span className="flex size-7 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <step.icon className="size-3.5" aria-hidden />
                  </span>
                  <span className="text-[10px] font-medium tabular-nums text-muted-foreground/60">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                </div>
                <span className="text-xs font-medium">{step.label}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-6 py-20">
        <h2 className="text-2xl font-semibold tracking-tight">Built around the parts that actually break</h2>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Not a booking calendar with a database behind it — the workflow, the conflicts and the
          custody trail are the product.
        </p>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <div
              key={feature.title}
              className="rounded-xl border border-border bg-card p-5 shadow-xs transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-soft"
            >
              <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <feature.icon className="size-4" aria-hidden />
              </div>
              <h3 className="mt-4 font-semibold">{feature.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{feature.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-border bg-card">
        <div className="mx-auto w-full max-w-6xl px-6 py-20">
          <h2 className="text-2xl font-semibold tracking-tight">Four roles, one system</h2>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Access is enforced in the database with row level security, not just hidden in the
            interface.
          </p>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {ROLES.map((role) => (
              <div
                key={role.name}
                className="rounded-xl border border-border bg-background p-6 transition-shadow duration-200 hover:shadow-soft"
              >
                <div className="flex items-center gap-2.5">
                  <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <role.icon className="size-4" aria-hidden />
                  </span>
                  <h3 className="font-semibold">{role.name}</h3>
                </div>
                <ul className="mt-4 space-y-2">
                  {role.points.map((point) => (
                    <li key={point} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <BadgeCheck className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden />
                      {point}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-6 py-20">
        <div className="relative overflow-hidden rounded-2xl border border-border bg-card px-8 py-14 text-center shadow-soft">
          <div aria-hidden className="bg-mesh pointer-events-none absolute inset-0" />
          <div className="relative">
            <h2 className="text-2xl font-semibold tracking-tight">Try it with a demo account</h2>
            <p className="mx-auto mt-2 max-w-xl text-muted-foreground">
              Sign in as a student, lab staff member, coordinator or administrator. Each role comes
              with labs, equipment and booking history already loaded.
            </p>
            <Button size="lg" className="mt-6" render={<Link href="/login" />}>
              Choose a role
              <ArrowRight className="size-4" aria-hidden />
            </Button>
          </div>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-2 px-6 py-6 text-xs text-muted-foreground">
          <span>Lab Reserve — University Lab &amp; Equipment Booking System</span>
          <span>Built with Next.js and Supabase</span>
        </div>
      </footer>
    </div>
  );
}
