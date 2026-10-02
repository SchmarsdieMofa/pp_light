"use client";

import { Archive, CalendarDays, FolderKanban, Home, Search, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { OPEN_PALETTE_EVENT } from "@/components/shell/command-center";
import { NewProjectDialog } from "@/components/projects/new-project-dialog";
import { cn } from "@/lib/utils";
import { NotificationLink } from "./notification-link";
import { UserMenu } from "./user-menu";

export type SidebarProject = { id: string; name: string; key: string };

const navItem = "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent";
const navActive = "bg-accent font-medium";

export function Sidebar({ user, projects, initialUnread, isAdmin }: { user: { name: string; email: string }; projects: SidebarProject[]; initialUnread: number; isAdmin: boolean }) {
  const pathname = usePathname();
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r bg-muted/30">
      <div className="px-4 py-3 text-sm font-semibold">pp_light</div>
      <nav aria-label="Hauptnavigation" className="flex flex-1 flex-col gap-1 px-2">
        <Link href="/" className={cn(navItem, pathname === "/" && navActive)}>
          <Home className="size-4" /> Start
        </Link>
        <Link href="/projects" className={cn(navItem, pathname === "/projects" && navActive)}>
          <FolderKanban className="size-4" /> Projektübersicht
        </Link>
        <Link href="/projects/archive" className={cn(navItem, pathname === "/projects/archive" && navActive)}>
          <Archive className="size-4" /> Archiv
        </Link>
        <Link href="/calendar" className={cn(navItem, pathname === "/calendar" && navActive)}>
          <CalendarDays className="size-4" /> Kalender
        </Link>
        <button
          type="button"
          className={cn(navItem, "text-left")}
          onClick={() => window.dispatchEvent(new Event(OPEN_PALETTE_EVENT))}
        >
          <Search className="size-4" /> Suchen
          <kbd className="ml-auto rounded border bg-background px-1 text-[10px] text-muted-foreground">Strg K</kbd>
        </button>
        <NotificationLink initialUnread={initialUnread} />
        {isAdmin && <Link href="/admin" className={cn(navItem, pathname === "/admin" && navActive)}><Users className="size-4" /> Nutzerverwaltung</Link>}
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
