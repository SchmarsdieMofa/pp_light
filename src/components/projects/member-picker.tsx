"use client";

import { ChevronsUpDown, Search, Users, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { searchGroupsAction, searchUsersAction } from "@/app/(app)/projects/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { GroupSuggestion } from "@/server/groups/service";
import type { UserSuggestion } from "@/server/members/service";

const inputClass =
  "h-8 min-w-0 rounded-md border bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export type PickedGroup = GroupSuggestion;
type Entry = { kind: "user"; user: UserSuggestion } | { kind: "group"; group: GroupSuggestion };

const entryKey = (entry: Entry) => (entry.kind === "group" ? `g${entry.group.id}` : entry.user.id);

/** People and groups matching `query`; nothing is fetched while the query is empty unless `browse` is set. `null` while loading. */
function usePeopleSearch(projectId: string, query: string, browse: boolean): Entry[] | null {
  const [state, setState] = useState<{ key: string; entries: Entry[] }>({ key: "", entries: [] });
  const key = `${browse ? "b" : "s"}:${query.trim()}`;
  useEffect(() => {
    if (!browse && !query.trim()) return;
    let stale = false;
    const timer = setTimeout(async () => {
      const [people, groups] = await Promise.all([searchUsersAction(projectId, query, browse), searchGroupsAction(projectId, query, browse)]);
      if (stale || !people.ok) return;
      const entries: Entry[] = [
        ...(groups.ok ? groups.data.map((group): Entry => ({ kind: "group", group })) : []),
        ...people.data.map((user): Entry => ({ kind: "user", user })),
      ];
      setState({ key, entries });
    }, 180);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [projectId, query, browse, key]);
  return !browse && !query.trim() ? [] : state.key === key ? state.entries : null;
}

function EntryLine({ entry }: { entry: Entry }) {
  if (entry.kind === "group") {
    const { group } = entry;
    return (
      <>
        <span className="flex items-center gap-1.5 font-medium [overflow-wrap:anywhere]">
          <Users className="size-3.5 shrink-0" aria-hidden />
          {group.name}
        </span>
        <span className="block text-xs text-muted-foreground">
          Gruppe · {group.addable} {group.addable === 1 ? "Person" : "Personen"} noch nicht im Projekt
        </span>
      </>
    );
  }
  return (
    <>
      <span className="block font-medium [overflow-wrap:anywhere]">{entry.user.name}</span>
      <span className="block text-xs text-muted-foreground [overflow-wrap:anywhere]">{entry.user.email}</span>
    </>
  );
}

/**
 * E-mail field that suggests matching people and groups while you type (nothing until then) and opens
 * a larger search dialog from the button next to it. A picked group replaces the field until it is cleared.
 */
export function MemberPicker(props: {
  projectId: string;
  value: string;
  onChange: (email: string) => void;
  group: PickedGroup | null;
  onGroupChange: (group: PickedGroup | null) => void;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [dialog, setDialog] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const suggestions = usePeopleSearch(props.projectId, props.group ? "" : props.value, false);
  const shown = open && suggestions !== null && suggestions.length > 0 ? suggestions : [];

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  function pick(entry: Entry) {
    if (entry.kind === "group") {
      props.onGroupChange(entry.group);
      props.onChange("");
    } else {
      props.onChange(entry.user.email);
    }
    setOpen(false);
  }

  return (
    <div ref={rootRef} className="relative flex min-w-0 flex-1 basis-56 gap-1">
      {props.group ? (
        <span className={cn(inputClass, "flex flex-1 items-center gap-1.5 bg-muted/40")}>
          <Users className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <span className="min-w-0 flex-1 truncate">Gruppe {props.group.name}</span>
          <button type="button" aria-label="Gruppe abwählen" onClick={() => props.onGroupChange(null)} className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground">
            <X className="size-3.5" />
          </button>
        </span>
      ) : (
        <input
          type="text"
          inputMode="email"
          autoComplete="off"
          role="combobox"
          aria-expanded={shown.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={shown.length > 0 ? `${listId}-${active}` : undefined}
          aria-label="Name oder E-Mail des Mitglieds"
          placeholder="Name, E-Mail oder Gruppe"
          value={props.value}
          onChange={(event) => {
            props.onChange(event.target.value);
            setOpen(true);
            setActive(0);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape" && shown.length > 0) {
              event.preventDefault();
              setOpen(false);
            } else if (event.key === "ArrowDown" && shown.length > 0) {
              event.preventDefault();
              setActive((index) => (index + 1) % shown.length);
            } else if (event.key === "ArrowUp" && shown.length > 0) {
              event.preventDefault();
              setActive((index) => (index - 1 + shown.length) % shown.length);
            } else if (event.key === "Enter" && shown.length > 0 && shown[active]) {
              event.preventDefault();
              pick(shown[active]);
            }
          }}
          className={cn(inputClass, "flex-1")}
        />
      )}
      <Button type="button" size="icon-sm" variant="outline" aria-label="Alle Personen und Gruppen durchsuchen" title="Alle Personen und Gruppen durchsuchen" onClick={() => setDialog(true)}>
        <ChevronsUpDown />
      </Button>
      {shown.length > 0 && (
        <ul id={listId} role="listbox" aria-label="Vorschläge" className="absolute top-full right-0 left-0 z-30 mt-1 max-h-64 overflow-y-auto rounded-md border bg-popover p-1 shadow-md">
          {shown.map((entry, index) => (
            <li
              key={entryKey(entry)}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              // Mouse down, not click: the input must not lose focus before the pick lands.
              onMouseDown={(event) => {
                event.preventDefault();
                pick(entry);
              }}
              onMouseEnter={() => setActive(index)}
              className={cn("cursor-pointer rounded px-2 py-1 text-sm", index === active && "bg-accent")}
            >
              <EntryLine entry={entry} />
            </li>
          ))}
        </ul>
      )}
      <PickerDialog
        projectId={props.projectId}
        open={dialog}
        onOpenChange={setDialog}
        onPick={(entry) => {
          pick(entry);
          setDialog(false);
        }}
      />
    </div>
  );
}

function PickerDialog(props: { projectId: string; open: boolean; onOpenChange: (open: boolean) => void; onPick: (entry: Entry) => void }) {
  const [query, setQuery] = useState("");
  const entries = usePeopleSearch(props.projectId, props.open ? query : "", props.open);
  return (
    <Dialog open={props.open} onOpenChange={(next) => { props.onOpenChange(next); if (!next) setQuery(""); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Person oder Gruppe hinzufügen</DialogTitle>
          <DialogDescription>
            Suche nach Name oder E-Mail. Nur aktive Personen, die noch nicht im Projekt sind. Eine Gruppe fügt alle ihre Personen auf einmal hinzu.
          </DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            type="search"
            autoFocus
            aria-label="Personen und Gruppen suchen"
            placeholder="Suchen…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className={cn(inputClass, "w-full pl-8")}
          />
        </div>
        <ul aria-label="Treffer" className="max-h-80 divide-y overflow-y-auto rounded-md border">
          {entries === null && <li className="px-3 py-2 text-sm text-muted-foreground">Lädt…</li>}
          {entries?.length === 0 && <li className="px-3 py-2 text-sm text-muted-foreground">Niemand gefunden.</li>}
          {entries?.map((entry) => (
            <li key={entryKey(entry)}>
              <button type="button" onClick={() => props.onPick(entry)} className="w-full px-3 py-2 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none">
                <EntryLine entry={entry} />
              </button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
