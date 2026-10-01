import Link from "next/link";
import { ClipboardCheck, Clock, FlaskConical, ShieldCheck } from "lucide-react";

/**
 * Auth chrome: split layout. The brand panel carries the product promise on a
 * subtle glass card; the form side stays completely solid for readability.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-svh lg:grid-cols-[1.05fr_1fr]">
      <div className="relative hidden flex-col justify-between overflow-hidden border-r border-border bg-card p-10 lg:flex">
        <div aria-hidden className="bg-mesh pointer-events-none absolute inset-0" />

        <Link href="/" className="relative flex items-center gap-2.5 font-semibold">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <FlaskConical className="size-4" aria-hidden />
          </span>
          Lab Reserve
        </Link>

        <div className="relative">
          <div className="glass rounded-2xl border p-6">
            <h2 className="text-xl font-semibold tracking-tight">
              Every lab booking, one calm system.
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Live availability, conflict-free approvals and an equipment custody trail — for
              students, faculty and lab staff.
            </p>
            <ul className="mt-5 space-y-2.5 border-t border-border/60 pt-5">
              <li className="flex items-start gap-2.5 text-sm">
                <Clock className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                Live availability across every lab and kit
              </li>
              <li className="flex items-start gap-2.5 text-sm">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                Conflicts blocked before they are written
              </li>
              <li className="flex items-start gap-2.5 text-sm">
                <ClipboardCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                Approvals scored and routed by priority
              </li>
            </ul>
          </div>
        </div>

        <p className="relative text-xs text-muted-foreground">
          University Lab &amp; Equipment Booking System
        </p>
      </div>

      <div className="flex flex-col items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <Link href="/" className="mb-8 flex items-center gap-2.5 font-semibold lg:hidden">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <FlaskConical className="size-4" aria-hidden />
            </span>
            Lab Reserve
          </Link>
          {children}
        </div>
      </div>
    </div>
  );
}
