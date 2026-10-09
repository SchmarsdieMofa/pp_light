"use client";

import { Archive, CalendarDays, ChevronRight, Folder as FolderIcon, FolderKanban, Home, Pin, Search, Settings2 } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { moveProjectToFolderAction } from "@/app/(app)/folders/actions";
import { OPEN_PALETTE_EVENT } from "@/components/shell/command-center";
import { FolderDialog } from "@/components/folders/folder-dialog";
import { NewFolderButton } from "@/components/folders/new-folder-button";
import { PinButton } from "@/components/projects/pin-button";
import { NewProjectDialog } from "@/components/projects/new-project-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ProjectRole } from "@/lib/enums";
import { cn } from "@/lib/utils";
import { NotificationLink } from "./notification-link";
import { UserMenu } from "./user-menu";

export type SidebarProject = {
  id: string;
  name: string;
  key: string;
  pinned: boolean;
  /** Only set for folders the person is in themselves. */
  folderId: string | null;
  /** Moving a project between folders is up to its owners. */
  canMove: boolean;
};
export type SidebarFolder = { id: string; name: string; role: ProjectRole };

const navItem = "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent";
const navActive = "bg-accent font-medium";

export function Sidebar({ user, projects, folders, initialUnread }: { user: { name: string; email: string }; projects: SidebarProject[]; folders: SidebarFolder[]; initialUnread: number }) {
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
          <SidebarProjects projects={projects} folders={folders} pathname={pathname} />
          <NewProjectDialog listen folders={folders} />
          <NewFolderButton />
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

const COLLAPSED_EVENT = "pp-sidebar-projects-toggle";
const PROJECTS_KEY = "pp-sidebar-projects-collapsed";

// Used when storage is blocked: the toggle then still works until the next reload.
const collapsedFallback = new Map<string, boolean>();

function subscribeCollapsed(onChange: () => void) {
  window.addEventListener(COLLAPSED_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(COLLAPSED_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function readCollapsed(key: string) {
  try {
    const stored = localStorage.getItem(key);
    return stored === null ? (collapsedFallback.get(key) ?? false) : stored === "1";
  } catch {
    return collapsedFallback.get(key) ?? false;
  }
}

function writeCollapsed(key: string, value: boolean) {
  collapsedFallback.set(key, value);
  try {
    localStorage.setItem(key, value ? "1" : "0");
  } catch {
    // Blocked storage: collapsedFallback carries the state.
  }
  window.dispatchEvent(new Event(COLLAPSED_EVENT));
}

/** A section that folds away; the remembered state survives reloads. Expanded on the server and during hydration. */
function useCollapsed(key: string): [boolean, (value: boolean) => void] {
  const collapsed = useSyncExternalStore(subscribeCollapsed, () => readCollapsed(key), () => false);
  const set = useCallback((value: boolean) => writeCollapsed(key, value), [key]);
  return [collapsed, set];
}

/**
 * Pinned projects on top, then one section per folder the person is in, then the remaining projects.
 * A folded section keeps the open project visible.
 */
function SidebarProjects({ projects, folders, pathname }: { projects: SidebarProject[]; folders: SidebarFolder[]; pathname: string }) {
  const pinned = projects.filter((p) => p.pinned);
  const unpinned = projects.filter((p) => !p.pinned);
  const others = unpinned.filter((p) => !p.folderId || !folders.some((f) => f.id === p.folderId));
  const isActive = (p: SidebarProject) => pathname.startsWith(`/projects/${p.id}`);
  const [dragging, setDragging] = useState<SidebarProject | null>(null);
  const drag: ProjectDrag = {
    dragging,
    start: setDragging,
    end: () => setDragging(null),
    async move(projectId, folder) {
      const project = projects.find((p) => p.id === projectId);
      setDragging(null);
      if (!project || project.folderId === (folder?.id ?? null)) return;
      const res = await moveProjectToFolderAction(project.id, folder?.id ?? null);
      if (res.ok) toast.success(folder ? `${project.name} liegt jetzt im Ordner ${folder.name}` : `${project.name} liegt in keinem Ordner mehr`);
      else toast.error(res.error.message);
    },
  };
  // Leaving a folder needs a place to drop: while a project of a folder is dragged, the unfoldered list is always there.
  const showOthers = others.length > 0 || (dragging?.folderId != null && dragging.canMove);
  return (
    <ProjectDragContext.Provider value={drag}>
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
      {folders.map((folder) => (
        <FolderSection
          key={folder.id}
          folder={folder}
          projects={unpinned.filter((p) => p.folderId === folder.id)}
          pinnedCount={pinned.filter((p) => p.folderId === folder.id).length}
          isActive={isActive}
        />
      ))}
      {showOthers && <ProjectsSection title="Projekte" storageKey={PROJECTS_KEY} listId="sidebar-projects" projects={others} isActive={isActive} />}
    </ProjectDragContext.Provider>
  );
}

const PROJECT_DRAG = "application/x-pp-project";

type ProjectDrag = {
  /** The project being dragged by a person who may move it. */
  dragging: SidebarProject | null;
  start: (project: SidebarProject) => void;
  end: () => void;
  /** Drop on a folder, or on the unfoldered list (`null`). */
  move: (projectId: string, folder: SidebarFolder | null) => Promise<void>;
};

const ProjectDragContext = createContext<ProjectDrag>({ dragging: null, start: () => {}, end: () => {}, move: async () => {} });

/** Native drag and drop target for projects: highlighted while a project hovers it. */
function useProjectDropTarget(enabled: boolean, folder: SidebarFolder | null) {
  const drag = useContext(ProjectDragContext);
  const [over, setOver] = useState(false);
  const active = enabled && drag.dragging !== null;
  const props = active
    ? {
        onDragOver(event: React.DragEvent) {
          if (!event.dataTransfer.types.includes(PROJECT_DRAG)) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          setOver(true);
        },
        onDragLeave(event: React.DragEvent) {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(false);
        },
        onDrop(event: React.DragEvent) {
          event.preventDefault();
          setOver(false);
          const id = event.dataTransfer.getData(PROJECT_DRAG);
          if (id) void drag.move(id, folder);
        },
      }
    : {};
  return { props, over: active && over, hint: active };
}

function SectionToggle(props: { title: string; collapsed: boolean; onToggle: () => void; controls: string; count: number; icon?: React.ReactNode; className?: string }) {
  return (
    <button
      type="button"
      aria-expanded={!props.collapsed}
      aria-controls={props.controls}
      onClick={props.onToggle}
      className={cn("flex min-w-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium uppercase text-muted-foreground hover:bg-accent hover:text-foreground", props.className)}
    >
      <ChevronRight className={cn("size-3.5 shrink-0 transition-transform", !props.collapsed && "rotate-90")} aria-hidden />
      {props.icon}
      <span className="truncate">{props.title}</span>
      {props.collapsed && <span className="ml-auto font-normal normal-case">{props.count}</span>}
    </button>
  );
}

function ProjectsSection(props: { title: string; storageKey: string; listId: string; projects: SidebarProject[]; isActive: (p: SidebarProject) => boolean }) {
  const [collapsed, setCollapsed] = useCollapsed(props.storageKey);
  const shown = collapsed ? props.projects.filter(props.isActive) : props.projects;
  const { dragging } = useContext(ProjectDragContext);
  // Only a project that sits in a folder can be dropped here (out of the folder).
  const drop = useProjectDropTarget(dragging?.folderId != null, null);
  return (
    <div {...drop.props} className={cn("rounded-md", drop.over && "bg-accent/60 ring-2 ring-primary/40")}>
      <SectionToggle title={props.title} collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} controls={props.listId} count={props.projects.length} className="mt-4" />
      <ul id={props.listId} className="flex flex-col gap-1">
        {shown.map((p) => (
          <ProjectRow key={p.id} project={p} active={props.isActive(p)} />
        ))}
        {drop.hint && <li className="px-2 py-1 text-xs text-muted-foreground">Hierher ziehen: kein Ordner</li>}
      </ul>
    </div>
  );
}

function FolderSection({ folder, projects, pinnedCount, isActive }: { folder: SidebarFolder; projects: SidebarProject[]; /** Projects of this folder that sit under "Angepinnt". */ pinnedCount: number; isActive: (p: SidebarProject) => boolean }) {
  const [collapsed, setCollapsed] = useCollapsed(`pp-sidebar-folder-collapsed-${folder.id}`);
  const [managing, setManaging] = useState(false);
  const shown = collapsed ? projects.filter(isActive) : projects;
  const listId = `sidebar-folder-${folder.id}`;
  const { dragging } = useContext(ProjectDragContext);
  // Putting a project into a folder needs owner or member there (the server checks the project's owner).
  const drop = useProjectDropTarget(folder.role !== "guest" && dragging?.folderId !== folder.id, folder);
  return (
    <div
      role="group"
      aria-label={`Ordner ${folder.name}`}
      {...drop.props}
      className={cn("group/folder rounded-md", drop.over && "bg-accent/60 ring-2 ring-primary/40")}
    >
      <div className="mt-4 flex items-center gap-1">
        <SectionToggle
          title={folder.name}
          collapsed={collapsed}
          onToggle={() => setCollapsed(!collapsed)}
          controls={listId}
          count={projects.length}
          icon={<FolderIcon className="size-3 shrink-0" aria-hidden />}
          className="flex-1"
        />
        <button
          type="button"
          aria-label={`Ordner ${folder.name} verwalten`}
          title="Ordner verwalten"
          onClick={() => setManaging(true)}
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring [@media(hover:hover)]:opacity-0 group-hover/folder:opacity-100 focus-visible:opacity-100"
        >
          <Settings2 className="size-3.5" aria-hidden />
        </button>
      </div>
      <ul id={listId} className="flex flex-col gap-1">
        {shown.map((p) => (
          <ProjectRow key={p.id} project={p} active={isActive(p)} />
        ))}
        {projects.length === 0 && !collapsed && (
          <li className="px-2 py-1 text-xs text-muted-foreground">{pinnedCount > 0 ? `${pinnedCount === 1 ? "Das Projekt ist" : "Alle Projekte sind"} oben angepinnt` : "Noch keine Projekte"}</li>
        )}
      </ul>
      {managing && <FolderDialog folderId={folder.id} open onOpenChange={(next) => { if (!next) setManaging(false); }} />}
    </div>
  );
}

/** A project in the sidebar; the pin shows on hover and keyboard focus (always on touch screens, where there is no hover). */
function ProjectRow({ project, active }: { project: SidebarProject; active: boolean }) {
  const drag = useContext(ProjectDragContext);
  return (
    <li
      className={cn("group/row relative", drag.dragging?.id === project.id && "opacity-50")}
      draggable={project.canMove}
      onDragStart={(event) => {
        if (!project.canMove) return;
        event.dataTransfer.setData(PROJECT_DRAG, project.id);
        event.dataTransfer.effectAllowed = "move";
        drag.start(project);
      }}
      onDragEnd={drag.end}
    >
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
