"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { slug: "board", label: "Board" },
  { slug: "gantt", label: "Gantt" },
  { slug: "list", label: "Liste" },
  { slug: "settings", label: "Einstellungen" },
] as const;

export function ProjectTabs({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Projektansichten" className="mt-2 flex gap-4 overflow-x-auto whitespace-nowrap">
      {TABS.map((tab) => {
        const href = `/projects/${projectId}/${tab.slug}`;
        const active = pathname === href;
        return (
          <Link
            key={tab.slug}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "border-b-2 pb-2 text-sm",
              tab.slug === "gantt" && "hidden md:block",
              active ? "border-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
