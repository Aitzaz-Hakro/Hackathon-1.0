import Link from "next/link";
import { FlaskConical } from "lucide-react";

import { NotificationsMenu, type NotificationItem } from "@/components/notifications-menu";
import { MobileNav, SidebarNav } from "@/components/sidebar-nav";
import { titleCase } from "@/components/status-badge";
import { UserMenu } from "@/components/user-menu";
import type { Profile } from "@/lib/types";

/**
 * The authenticated shell: fixed sidebar on desktop, sheet on mobile, topbar
 * with notifications and the account menu.
 *
 * A Server Component — the interactive pieces are the client children
 * (`SidebarNav`, `NotificationsMenu`, `UserMenu`), which receive only
 * serialisable data.
 */
export function AppShell({
  profile,
  notifications,
  unreadCount,
  children,
}: {
  profile: Profile;
  notifications: NotificationItem[];
  unreadCount: number;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-svh w-full">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-border bg-sidebar lg:flex">
        <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4 font-semibold">
          <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <FlaskConical className="size-4" aria-hidden />
          </span>
          Lab Reserve
        </div>
        <div className="flex-1 overflow-y-auto py-4">
          <SidebarNav role={profile.role} />
        </div>
        <div className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">{titleCase(profile.role)}</p>
          <p className="truncate">{profile.email}</p>
        </div>
      </aside>

      <div className="relative flex min-w-0 flex-1 flex-col lg:pl-60">
        {/* Faint mesh behind the header area so the glass has something to sit on. */}
        <div aria-hidden className="bg-mesh pointer-events-none absolute inset-x-0 top-0 -z-10 h-44" />
        <header className="glass sticky top-0 z-30 flex h-14 items-center gap-1.5 border-b border-border/60 px-3 sm:px-4">
          <MobileNav role={profile.role} />
          <Link href="/dashboard" className="font-semibold lg:hidden">
            Lab Reserve
          </Link>
          <div className="flex-1" />
          <NotificationsMenu notifications={notifications} unreadCount={unreadCount} />
          <UserMenu fullName={profile.full_name} email={profile.email} role={profile.role} />
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
