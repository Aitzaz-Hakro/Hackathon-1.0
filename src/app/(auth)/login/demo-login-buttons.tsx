"use client";

import { useActionState } from "react";
import {
  BookOpen,
  ClipboardCheck,
  GraduationCap,
  Settings2,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { demoLogin } from "@/lib/actions/auth";
import { DEMO_ACCOUNTS, type DemoAccount } from "@/lib/demo-accounts";
import { cn } from "@/lib/utils";

const ROLE_ICONS: Record<DemoAccount["role"], LucideIcon> = {
  student: GraduationCap,
  faculty: BookOpen,
  lab_staff: Wrench,
  coordinator: ClipboardCheck,
  admin: Settings2,
};

const ROLE_HINTS: Record<DemoAccount["role"], string> = {
  student: "Book labs and equipment",
  faculty: "Book with priority review",
  lab_staff: "Approvals and issue desk",
  coordinator: "Rules, labs and analytics",
  admin: "Full administration",
};

/**
 * One submit button per seeded role. The password never reaches the client —
 * `demoLogin` attaches it server-side.
 */
export function DemoLoginButtons() {
  const [state, formAction, pending] = useActionState(demoLogin, null);

  return (
    <form action={formAction} className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        {DEMO_ACCOUNTS.map((account, index) => {
          const Icon = ROLE_ICONS[account.role];
          return (
            <Button
              key={account.email}
              type="submit"
              name="email"
              value={account.email}
              variant="outline"
              disabled={pending}
              className={cn(
                "h-auto justify-start gap-3 px-3 py-2.5",
                index === DEMO_ACCOUNTS.length - 1 && "sm:col-span-2",
              )}
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="size-4" aria-hidden />
              </span>
              <span className="min-w-0 text-left">
                <span className="block text-sm font-medium">{account.label}</span>
                <span className="block truncate text-xs font-normal text-muted-foreground">
                  {ROLE_HINTS[account.role]}
                </span>
              </span>
            </Button>
          );
        })}
      </div>
      {state?.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
