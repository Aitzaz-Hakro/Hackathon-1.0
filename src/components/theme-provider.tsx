"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

/**
 * Wraps the app so `next-themes` can resolve the current theme.
 *
 * `attribute="class"` matches `globals.css`, which defines its dark tokens
 * under a `.dark` class (`@custom-variant dark (&:is(.dark *))`).
 *
 * `disableTransitionOnChange` stops every colour transition firing at once
 * when the theme flips, which otherwise looks like a flicker.
 */
export function ThemeProvider({ children, ...props }: ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}
