"use client";

import { useTransition } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";

import { markAllNotificationsRead } from "@/lib/actions/notifications";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type NotificationItem = {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
};

export function NotificationsMenu({
  notifications,
  unreadCount,
}: {
  notifications: NotificationItem[];
  unreadCount: number;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon-lg" className="relative" aria-label="Notifications" />}
      >
        <Bell className="size-4" aria-hidden />
        {unreadCount > 0 ? (
          <span className="absolute top-1 right-1 flex size-3.5 items-center justify-center rounded-full bg-primary text-[9px] font-medium text-primary-foreground">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80">
        <div className="flex items-center justify-between px-1.5 py-1">
          <span className="text-sm font-medium">Notifications</span>
          {unreadCount > 0 ? (
            <button
              type="button"
              disabled={pending}
              className="text-xs text-primary hover:underline disabled:opacity-50"
              onClick={() => startTransition(async () => { await markAllNotificationsRead(); })}
            >
              Mark all read
            </button>
          ) : null}
        </div>

        <DropdownMenuSeparator />

        {notifications.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            Nothing yet — updates about your bookings show up here.
          </p>
        ) : (
          notifications.map((notification) => (
            <DropdownMenuItem
              key={notification.id}
              className="items-start py-2"
              render={<Link href={notification.link ?? "/dashboard"} />}
            >
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  {!notification.is_read ? (
                    <span className="size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                  ) : null}
                  <span className="truncate">{notification.title}</span>
                </span>
                {notification.body ? (
                  <span className="mt-0.5 line-clamp-2 block text-xs font-normal text-muted-foreground">
                    {notification.body}
                  </span>
                ) : null}
                <span className={cn("mt-1 block text-[10px] text-muted-foreground")}>
                  {notification.created_at.slice(0, 16).replace("T", " ")}
                </span>
              </span>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
