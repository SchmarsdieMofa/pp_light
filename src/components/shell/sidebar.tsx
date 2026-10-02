"use client";

import { Archive, CalendarDays, ChevronRight, FolderKanban, Home, Search, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
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
        <SidebarProjects projects={projects} pathname={pathname} />
        <NewProjectDialog />
      </nav>
      <div className="border-t p-2">
        <UserMenu user={user} />
      </div>
    </aside>
  );
}

const COLLAPSED_KEY = "pp-sidebar-projects-collapsed";
const COLLAPSED_EVENT = "pp-sidebar-projects-toggle";

function subscribeCollapsed(onChange: () => void) {
  window.addEventListener(COLLAPSED_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(COLLAPSED_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

// Used when storage is blocked: the toggle then still works until the next reload.
let collapsedFallback = false;

function readCollapsed() {
  try {
    const stored = localStorage.getItem(COLLAPSED_KEY);
    return stored === null ? collapsedFallback : stored === "1";
  } catch {
    return collapsedFallback;
  }
}

function writeCollapsed(value: boolean) {
  collapsedFallback = value;
  try {
    localStorage.setItem(COLLAPSED_KEY, value ? "1" : "0");
  } catch {
    // Blocked storage: collapsedFallback carries the state.
  }
  window.dispatchEvent(new Event(COLLAPSED_EVENT));
}

/** The project list folds away; the remembered state survives reloads. The open project stays visible while folded. */
function SidebarProjects({ projects, pathname }: { projects: SidebarProject[]; pathname: string }) {
  // Expanded on the server and during hydration, then whatever this browser remembered.
  const collapsed = useSyncExternalStore(subscribeCollapsed, readCollapsed, () => false);
  const isActive = (p: SidebarProject) => pathname.startsWith(`/projects/${p.id}`);
  const shown = collapsed ? projects.filter(isActive) : projects;
  return (
    <>
      <button
        type="button"
        aria-expanded={!collapsed}
        aria-controls="sidebar-projects"
        onClick={() => writeCollapsed(!collapsed)}
        className="mt-4 flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium uppercase text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <ChevronRight className={cn("size-3.5 transition-transform", !collapsed && "rotate-90")} aria-hidden />
        Projekte
        {collapsed && <span className="ml-auto font-normal normal-case">{projects.length}</span>}
      </button>
      <div id="sidebar-projects" className="flex flex-col gap-1">
        {shown.map((p) => (
          <Link key={p.id} href={`/projects/${p.id}/board`} className={cn(navItem, isActive(p) && navActive)}>
            <span className="min-w-8 shrink-0 text-xs text-muted-foreground">{p.key}</span>
            <span className="truncate">{p.name}</span>
          </Link>
        ))}
      </div>
    </>
  );
}
