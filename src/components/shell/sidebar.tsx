"use client";

import { Home } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NewProjectDialog } from "@/components/projects/new-project-dialog";
import { cn } from "@/lib/utils";
import { UserMenu } from "./user-menu";

export type SidebarProject = { id: string; name: string; key: string };

const navItem = "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent";
const navActive = "bg-accent font-medium";

export function Sidebar({ user, projects }: { user: { name: string; email: string }; projects: SidebarProject[] }) {
  const pathname = usePathname();
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r bg-muted/30">
      <div className="px-4 py-3 text-sm font-semibold">pp_light</div>
      <nav aria-label="Hauptnavigation" className="flex flex-1 flex-col gap-1 px-2">
        <Link href="/" className={cn(navItem, pathname === "/" && navActive)}>
          <Home className="size-4" /> Start
        </Link>
        <div className="mt-4 px-2 text-xs font-medium uppercase text-muted-foreground">Projekte</div>
        {projects.map((p) => (
          <Link
            key={p.id}
            href={`/projects/${p.id}/board`}
            className={cn(navItem, pathname.startsWith(`/projects/${p.id}`) && navActive)}
          >
            <span className="min-w-8 shrink-0 text-xs text-muted-foreground">{p.key}</span>
            <span className="truncate">{p.name}</span>
          </Link>
        ))}
        <NewProjectDialog />
      </nav>
      <div className="border-t p-2">
        <UserMenu user={user} />
      </div>
    </aside>
  );
}
