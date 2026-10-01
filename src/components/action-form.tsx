"use client";

import { useActionState } from "react";
import type { VariantProps } from "class-variance-authority";

import { Button, buttonVariants } from "@/components/ui/button";
import type { ActionResult } from "@/lib/actions/shared";
import { cn } from "@/lib/utils";

/**
 * Generic form wrapper for a Server Action used with `useActionState`.
 *
 * The state type is inferred from the action itself, so an action returning
 * `ActionResult<{ issueCount: number }>` keeps that payload type through the
 * hook without this component knowing anything domain-specific.
 */
type ServerAction<S extends ActionResult<unknown>> = (
  previous: S | null,
  formData: FormData,
) => Promise<S>;

export function ActionForm<S extends ActionResult<unknown>>({
  action,
  children,
  submitLabel,
  pendingLabel = "Saving…",
  variant = "default",
  size = "sm",
  className,
  buttonClassName,
  footer,
}: {
  action: ServerAction<S>;
  children: React.ReactNode;
  submitLabel: string;
  pendingLabel?: string;
  variant?: VariantProps<typeof buttonVariants>["variant"];
  size?: VariantProps<typeof buttonVariants>["size"];
  className?: string;
  buttonClassName?: string;
  footer?: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState<S | null, FormData>(action, null);

  return (
    <form action={formAction} className={cn("space-y-3", className)}>
      {children}

      {state?.error ? (
        <p role="alert" className="text-xs text-destructive">
          {state.error}
        </p>
      ) : null}
      {state?.ok && state.message ? (
        <p role="status" className="text-xs text-success">
          {state.message}
        </p>
      ) : null}

      <Button type="submit" variant={variant} size={size} className={buttonClassName} disabled={pending}>
        {pending ? pendingLabel : submitLabel}
      </Button>

      {footer}
    </form>
  );
}
