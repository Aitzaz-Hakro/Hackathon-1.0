"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  CalendarCheck,
  CalendarPlus,
  ClipboardCheck,
  FlaskConical,
  Hourglass,
  LayoutDashboard,
  Menu,
  Microscope,
  PackageCheck,
  QrCode,
  Settings2,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/lib/types";

type NavItem = { href: string; label: string; icon: LucideIcon };
type NavSection = { title: string; items: NavItem[] };

const isStaff = (role: UserRole) => role === "lab_staff" || role === "coordinator" || role === "admin";
const isCoordinator = (role: UserRole) => role === "coordinator" || role === "admin";

function sectionsFor(role: UserRole): NavSection[] {
  const sections: NavSection[] = [
    {
      title: "Book",
      items: [
        { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
        { href: "/bookings/new", label: "New booking", icon: CalendarPlus },
        { href: "/bookings", label: "My bookings", icon: CalendarCheck },
        { href: "/waitlist", label: "Waitlist", icon: Hourglass },
      ],
    },
    {
      title: "Browse",
      items: [
        { href: "/labs", label: "Labs", icon: FlaskConical },
        { href: "/equipment", label: "Equipment", icon: Microscope },
      ],
    },
  ];

  if (isStaff(role)) {
    sections.push({
      title: "Desk",
      items: [
        { href: "/approvals", label: "Approvals", icon: ClipboardCheck },
        { href: "/issues", label: "Issues & returns", icon: PackageCheck },
        { href: "/scan", label: "Scan", icon: QrCode },
      ],
    });
  }

  if (isCoordinator(role)) {
    sections.push({
      title: "Insights",
      items: [
        { href: "/analytics", label: "Analytics", icon: BarChart3 },
        { href: "/admin", label: "Administration", icon: Settings2 },
      ],
    });
  }

  return sections;
}

function isActive(pathname: string, href: string, allItems: NavItem[]): boolean {
  const matches = (target: string) => pathname === target || pathname.startsWith(`${target}/`);
  if (!matches(href)) return false;
  // Only the most specific match lights up, so /bookings/new does not also
  // highlight /bookings.
  const best = allItems
    .filter((item) => matches(item.href))
    .sort((a, b) => b.href.length - a.href.length)[0];
  return best?.href === href;
}

export function SidebarNav({ role, onNavigate }: { role: UserRole; onNavigate?: () => void }) {
  const pathname = usePathname();
  const sections = sectionsFor(role);
  const allItems = sections.flatMap((section) => section.items);

  return (
    <nav className="flex flex-col gap-4 px-2">
      {sections.map((section) => (
        <div key={section.title}>
          <p className="px-2 pb-1.5 text-[11px] font-semibold tracking-wider text-muted-foreground/80 uppercase">
            {section.title}
          </p>
          <div className="flex flex-col gap-0.5">
            {section.items.map((item) => {
              const active = isActive(pathname, item.href, allItems);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm transition-colors duration-150",
                    active
                      ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                      : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                  )}
                >
                  <item.icon className="size-4 shrink-0" aria-hidden />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

export function MobileNav({ role }: { role: UserRole }) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={<Button variant="ghost" size="icon-lg" className="lg:hidden" aria-label="Open navigation" />}
      >
        <Menu className="size-4" aria-hidden />
      </SheetTrigger>
      <SheetContent side="left" className="w-64 gap-0 p-0">
        <SheetHeader className="border-b border-border">
          <SheetTitle className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <FlaskConical className="size-4" aria-hidden />
            </span>
            Lab Reserve
          </SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto py-3">
          <SidebarNav role={role} onNavigate={() => setOpen(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
