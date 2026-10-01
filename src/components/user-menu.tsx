"use client";

import { useSyncExternalStore, useTransition } from "react";
import { ChevronDown, LogOut, Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { logout } from "@/lib/actions/auth";
import { titleCase } from "@/components/status-badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { UserRole } from "@/lib/types";

/** False during SSR and the first paint, true once the client is live. */
const emptySubscribe = () => () => {};
const useMounted = () => useSyncExternalStore(emptySubscribe, () => true, () => false);

export function UserMenu({
  fullName,
  email,
  role,
}: {
  fullName: string;
  email: string;
  role: UserRole;
}) {
  const { theme, setTheme } = useTheme();
  // `theme` is unresolved during SSR; rendering the radio group only after the
  // client takes over avoids a hydration mismatch.
  const mounted = useMounted();
  const [pending, startTransition] = useTransition();

  const initials =
    fullName
      .split(" ")
      .map((part) => part.charAt(0))
      .slice(0, 2)
      .join("")
      .toUpperCase() || "U";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" className="h-9 gap-2 px-1.5" aria-label="Account menu" />}
      >
        <Avatar size="sm">
          <AvatarFallback className="bg-primary/10 font-medium text-primary">{initials}</AvatarFallback>
        </Avatar>
        <span className="hidden max-w-32 truncate text-sm font-medium sm:block">{fullName}</span>
        <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>
          <span className="block truncate text-sm font-medium text-foreground">{fullName}</span>
          <span className="block truncate text-xs font-normal">{email}</span>
          <span className="mt-1 inline-flex rounded-full border bg-muted px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase">
            {titleCase(role)}
          </span>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <DropdownMenuLabel>Theme</DropdownMenuLabel>
        {mounted ? (
          <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
            <DropdownMenuRadioItem value="light">
              <Sun className="size-4" aria-hidden /> Light
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="dark">
              <Moon className="size-4" aria-hidden /> Dark
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="system">
              <Monitor className="size-4" aria-hidden /> System
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        ) : null}

        <DropdownMenuSeparator />

        <DropdownMenuItem
          variant="destructive"
          disabled={pending}
          onClick={() => startTransition(async () => { await logout(); })}
        >
          <LogOut className="size-4" aria-hidden />
          {pending ? "Signing out…" : "Sign out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
