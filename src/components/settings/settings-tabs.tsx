"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function SettingsTabs({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const tabs = [
    { href: "/settings", label: "Mein Konto" },
    ...(isAdmin ? [{ href: "/settings/users", label: "Nutzerverwaltung" }] : []),
  ];
  if (tabs.length < 2) return null;
  return (
    <nav aria-label="Einstellungsbereiche" className="flex gap-1 border-b">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={pathname === tab.href ? "page" : undefined}
          className={cn(
            "-mb-px border-b-2 border-transparent px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground",
            pathname === tab.href && "border-foreground font-medium text-foreground",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
