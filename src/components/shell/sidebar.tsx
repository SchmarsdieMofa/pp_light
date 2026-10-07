"use client";

import { Archive, CalendarDays, ChevronRight, FolderKanban, Home, Pin, Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { OPEN_PALETTE_EVENT } from "@/components/shell/command-center";
import { PinButton } from "@/components/projects/pin-button";
import { NewProjectDialog } from "@/components/projects/new-project-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { NotificationLink } from "./notification-link";
import { UserMenu } from "./user-menu";

export type SidebarProject = { id: string; name: string; key: string; pinned: boolean };

const navItem = "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent";
const navActive = "bg-accent font-medium";

export function Sidebar({ user, projects, initialUnread }: { user: { name: string; email: string }; projects: SidebarProject[]; initialUnread: number }) {
  const pathname = usePathname();
  return (
    <aside className="sticky top-0 flex h-svh w-60 shrink-0 flex-col border-r bg-muted/30">
      <div className="px-4 py-3 text-sm font-semibold">pp_light</div>
      <ScrollArea className="flex-1" scrollFade>
        <nav aria-label="Hauptnavigation" className="flex flex-col gap-1 px-2 pb-2">
          <Link href="/" className={cn(navItem, pathname === "/" && navActive)}>
            <Home className="size-4" /> Start
          </Link>
          <Link href="/projects" className={cn(navItem, pathname === "/projects" && navActive)}>
            <FolderKanban className="size-4" /> Projektübersicht
          </Link>
          <button
            type="button"
            className={cn(navItem, "text-left")}
            onClick={() => window.dispatchEvent(new Event(OPEN_PALETTE_EVENT))}
          >
            <Search className="size-4" /> Suchen
            <kbd className="ml-auto rounded border bg-background px-1 text-[10px] text-muted-foreground">Strg K</kbd>
          </button>
          <Link href="/calendar" className={cn(navItem, pathname === "/calendar" && navActive)}>
            <CalendarDays className="size-4" /> Kalender
          </Link>
          <NotificationLink initialUnread={initialUnread} />
          <SidebarProjects projects={projects} pathname={pathname} />
          <NewProjectDialog listen />
        </nav>
      </ScrollArea>
      <div className="flex flex-col gap-1 border-t p-2">
        <Link href="/projects/archive" className={cn(navItem, pathname === "/projects/archive" && navActive)}>
          <Archive className="size-4" /> Archiv
        </Link>
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
  const pinned = projects.filter((p) => p.pinned);
  const others = projects.filter((p) => !p.pinned);
  // Expanded on the server and during hydration, then whatever this browser remembered.
  const collapsed = useSyncExternalStore(subscribeCollapsed, readCollapsed, () => false);
  const isActive = (p: SidebarProject) => pathname.startsWith(`/projects/${p.id}`);
  const shown = collapsed ? others.filter(isActive) : others;
  return (
    <>
      {pinned.length > 0 && (
        <>
          <h2 className="mt-4 flex items-center gap-1 px-2 py-1 text-xs font-medium uppercase text-muted-foreground">
            <Pin className="size-3" aria-hidden />
            Angepinnt
          </h2>
          <ul aria-label="Angepinnte Projekte" className="flex flex-col gap-1">
            {pinned.map((p) => (
              <ProjectRow key={p.id} project={p} active={isActive(p)} />
            ))}
          </ul>
        </>
      )}
      {others.length > 0 && (
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
          {collapsed && <span className="ml-auto font-normal normal-case">{others.length}</span>}
        </button>
        <ul id="sidebar-projects" className="flex flex-col gap-1">
          {shown.map((p) => (
            <ProjectRow key={p.id} project={p} active={isActive(p)} />
          ))}
        </ul>
        </>
      )}
    </>
  );
}

/** A project in the sidebar; the pin shows on hover and keyboard focus (always on touch screens, where there is no hover). */
function ProjectRow({ project, active }: { project: SidebarProject; active: boolean }) {
  return (
    <li className="group/row relative">
      <Link href={`/projects/${project.id}/board`} className={cn(navItem, "pr-8", active && navActive)}>
        <span className="min-w-8 shrink-0 text-xs text-muted-foreground">{project.key}</span>
        <span className="truncate">{project.name}</span>
      </Link>
      <PinButton
        projectId={project.id}
        projectName={project.name}
        pinned={project.pinned}
        className={cn("absolute top-1/2 right-1 -translate-y-1/2", !project.pinned && "[@media(hover:hover)]:opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100")}
      />
    </li>
  );
}
