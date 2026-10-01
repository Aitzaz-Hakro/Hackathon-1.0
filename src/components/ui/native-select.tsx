import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Styled native `<select>`.
 *
 * Deliberately not the Base UI select: the filter bars use plain GET forms, so
 * the browser's own control is the right primitive — it submits with the form
 * and works without JavaScript. The native arrow is kept (and follows the
 * theme via `color-scheme`) rather than hidden with `appearance-none`.
 */
function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="native-select"
      className={cn(
        "h-9 w-full cursor-pointer rounded-lg border border-input bg-card px-3 py-1 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30",
        className,
      )}
      {...props}
    />
  );
}

export { NativeSelect };
