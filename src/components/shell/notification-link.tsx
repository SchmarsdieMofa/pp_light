"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export function NotificationLink({ initialUnread }: { initialUnread: number }) {
  const pathname = usePathname();
  const [unread, setUnread] = useState(initialUnread);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch("/api/notifications", { cache: "no-store" });
        if (response.ok && active) setUnread((await response.json()).unread);
      } catch { /* Try again at the next interval. */ }
    };
    const timer = setInterval(() => void refresh(), 30_000);
    window.addEventListener("notifications-changed", refresh);
    return () => { active = false; clearInterval(timer); window.removeEventListener("notifications-changed", refresh); };
  }, [pathname]);

  return (
    <Link href="/inbox" className={cn("flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent", pathname === "/inbox" && "bg-accent font-medium")}>
      <Bell className="size-4" /> Benachrichtigungen
      {unread > 0 && <span aria-label={`${unread} ungelesen`} className="ml-auto rounded-full bg-primary px-1.5 text-xs text-primary-foreground">{unread}</span>}
    </Link>
  );
}
