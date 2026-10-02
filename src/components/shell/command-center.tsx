"use client";

import { Bell, CalendarDays, FolderKanban, Home, Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { searchAction } from "@/app/(app)/search/actions";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { isTypingTarget, resolveShortcut, SHORTCUT_HELP } from "@/lib/shortcuts";
import { buildHref, normalizeSearchParams } from "@/lib/urls";
import { cn } from "@/lib/utils";
import type { SearchResult } from "@/server/search/service";

type Item = { id: string; label: string; hint: string; href: string; icon: "home" | "inbox" | "project" | "task" | "calendar" };

export const OPEN_PALETTE_EVENT = "pp:open-palette";

const ICONS = { home: Home, inbox: Bell, project: FolderKanban, task: Search, calendar: CalendarDays };

/** Global keyboard shortcuts plus the Strg+K command palette. Mounted once in the app layout. */
export function CommandCenter({ projects }: { projects: { id: string; key: string; name: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented) return;
      const shortcut = resolveShortcut(event, isTypingTarget(document.activeElement as HTMLElement | null), pathname);
      if (!shortcut) return;
      if (shortcut.kind === "closePanel") {
        if (!searchParams.get("task") || paletteOpen || helpOpen) return;
        router.push(buildHref(pathname, normalizeSearchParams(Object.fromEntries(searchParams.entries())), { task: null }));
      } else if (shortcut.kind === "palette") {
        setPaletteOpen(true);
      } else if (shortcut.kind === "help") {
        setHelpOpen(true);
      } else if (shortcut.kind === "view") {
        router.push(shortcut.href);
      } else if (shortcut.kind === "newTask") {
        const input = document.querySelector<HTMLInputElement>("[data-quick-add] input");
        if (input) input.focus();
        else toast.info("Neue Aufgaben legst du im Board oder in der Liste eines Projekts an.");
      }
      event.preventDefault();
    }
    const openPalette = () => setPaletteOpen(true);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener(OPEN_PALETTE_EVENT, openPalette);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(OPEN_PALETTE_EVENT, openPalette);
    };
  }, [pathname, searchParams, router, paletteOpen, helpOpen]);

  return (
    <>
      <Palette open={paletteOpen} onOpenChange={setPaletteOpen} projects={projects} />
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tastenkürzel</DialogTitle>
          </DialogHeader>
          <dl className="grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
            {SHORTCUT_HELP.map((s) => (
              <div key={s.keys} className="contents">
                <dt>
                  <kbd className="rounded border bg-muted px-1.5 py-0.5 text-xs">{s.keys}</kbd>
                </dt>
                <dd>{s.text}</dd>
              </div>
            ))}
          </dl>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Palette(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: { id: string; key: string; name: string }[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [active, setActive] = useState(0);
  const [, startTransition] = useTransition();
  const latest = useRef(0);

  const staticItems: Item[] = [
    { id: "home", label: "Meine Arbeit", hint: "Startseite", href: "/", icon: "home" },
    { id: "projects", label: "Projektübersicht", hint: "Alle Projekte", href: "/projects", icon: "project" },
    { id: "calendar", label: "Kalender", hint: "Termine aller Projekte", href: "/calendar", icon: "calendar" },
    { id: "inbox", label: "Benachrichtigungen", hint: "Inbox", href: "/inbox", icon: "inbox" },
    ...props.projects.map((p) => ({ id: `p-${p.id}`, label: p.name, hint: p.key, href: `/projects/${p.id}/board`, icon: "project" as const })),
  ];
  const q = query.trim();
  const items: Item[] = !q
    ? staticItems
    : [
        ...(result?.tasks ?? []).map((t) => ({
          id: t.id,
          label: t.title,
          hint: `${t.key}-${t.number} · ${t.projectName}`,
          href: `/tasks/${t.id}`,
          icon: "task" as const,
        })),
        ...(result?.projects ?? []).map((p) => ({ id: `p-${p.id}`, label: p.name, hint: p.key, href: `/projects/${p.id}/board`, icon: "project" as const })),
        ...staticItems.filter((i) => (i.id === "projects" || i.icon !== "project") && i.label.toLowerCase().includes(q.toLowerCase())),
      ];

  function search(value: string) {
    setQuery(value);
    setResult(null);
    setActive(0);
    const request = ++latest.current;
    if (!value.trim()) {
      setResult(null);
      return;
    }
    startTransition(async () => {
      const found = await searchAction(value);
      if (request === latest.current) setResult(found);
    });
  }

  function open(item: Item | undefined) {
    if (!item) return;
    props.onOpenChange(false);
    router.push(item.href);
  }

  return (
    <Dialog
      open={props.open}
      onOpenChange={(next) => {
        props.onOpenChange(next);
        if (!next) {
          setQuery("");
          setResult(null);
        }
      }}
    >
      <DialogContent className="gap-3 p-3 sm:max-w-xl">
        <DialogHeader className="sr-only">
          <DialogTitle>Suche und Befehle</DialogTitle>
        </DialogHeader>
        <Input
          autoFocus
          aria-label="Suche"
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-results"
          aria-activedescendant={items[active] ? `palette-${items[active].id}` : undefined}
          placeholder="Aufgaben, Projekte, Befehle suchen…"
          value={query}
          onChange={(e) => search(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((i) => Math.min(i + 1, items.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              open(items[active]);
            }
          }}
        />
        <ScrollArea className="max-h-80" viewportClassName="h-auto max-h-80" scrollFade>
          <ul id="palette-results" role="listbox" aria-label="Ergebnisse">
            {items.length === 0 && <li className="px-2 py-3 text-sm text-muted-foreground">Keine Treffer</li>}
            {items.map((item, index) => {
              const Icon = ICONS[item.icon];
              return (
                <li
                  key={item.id}
                  id={`palette-${item.id}`}
                  role="option"
                  aria-selected={index === active}
                  className={cn("flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm", index === active && "bg-accent")}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => open(item)}
                >
                  <Icon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{item.label}</span>
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">{item.hint}</span>
                </li>
              );
            })}
          </ul>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
