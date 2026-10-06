"use client";

import { ChevronsUpDown, Search } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { searchUsersAction } from "@/app/(app)/projects/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { UserSuggestion } from "@/server/members/service";

const inputClass =
  "h-8 min-w-0 rounded-md border bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/** Search results for `query`; nothing is fetched while the query is empty unless `browse` is set. */
function useUserSearch(projectId: string, query: string, browse: boolean) {
  const [state, setState] = useState<{ key: string; users: UserSuggestion[] }>({ key: "", users: [] });
  const key = `${browse ? "b" : "s"}:${query.trim()}`;
  useEffect(() => {
    if (!browse && !query.trim()) return;
    let stale = false;
    const timer = setTimeout(async () => {
      const res = await searchUsersAction(projectId, query, browse);
      if (!stale && res.ok) setState({ key, users: res.data });
    }, 180);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [projectId, query, browse, key]);
  return !browse && !query.trim() ? [] : state.key === key ? state.users : null;
}

function UserLine({ user }: { user: UserSuggestion }) {
  return (
    <>
      <span className="block font-medium [overflow-wrap:anywhere]">{user.name}</span>
      <span className="block text-xs text-muted-foreground [overflow-wrap:anywhere]">{user.email}</span>
    </>
  );
}

/**
 * E-mail field that suggests matching people while you type (nothing until then) and opens a larger
 * search dialog from the button next to it.
 */
export function MemberPicker(props: { projectId: string; value: string; onChange: (email: string) => void }) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [dialog, setDialog] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const suggestions = useUserSearch(props.projectId, props.value, false);
  const shown = open && suggestions !== null && suggestions.length > 0 ? suggestions : [];

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  function pick(user: UserSuggestion) {
    props.onChange(user.email);
    setOpen(false);
  }

  return (
    <div ref={rootRef} className="relative flex min-w-0 flex-1 basis-56 gap-1">
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
        placeholder="Name oder E-Mail der Person"
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
      <Button type="button" size="icon-sm" variant="outline" aria-label="Alle Personen durchsuchen" title="Alle Personen durchsuchen" onClick={() => setDialog(true)}>
        <ChevronsUpDown />
      </Button>
      {shown.length > 0 && (
        <ul id={listId} role="listbox" aria-label="Vorschläge" className="absolute top-full right-0 left-0 z-30 mt-1 max-h-64 overflow-y-auto rounded-md border bg-popover p-1 shadow-md">
          {shown.map((user, index) => (
            <li
              key={user.id}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              // Mouse down, not click: the input must not lose focus before the pick lands.
              onMouseDown={(event) => {
                event.preventDefault();
                pick(user);
              }}
              onMouseEnter={() => setActive(index)}
              className={cn("cursor-pointer rounded px-2 py-1 text-sm", index === active && "bg-accent")}
            >
              <UserLine user={user} />
            </li>
          ))}
        </ul>
      )}
      <PickerDialog
        projectId={props.projectId}
        open={dialog}
        onOpenChange={setDialog}
        onPick={(user) => {
          pick(user);
          setDialog(false);
        }}
      />
    </div>
  );
}

function PickerDialog(props: { projectId: string; open: boolean; onOpenChange: (open: boolean) => void; onPick: (user: UserSuggestion) => void }) {
  const [query, setQuery] = useState("");
  const users = useUserSearch(props.projectId, props.open ? query : "", props.open);
  return (
    <Dialog open={props.open} onOpenChange={(next) => { props.onOpenChange(next); if (!next) setQuery(""); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Person hinzufügen</DialogTitle>
          <DialogDescription>Suche nach Name oder E-Mail. Nur aktive Personen, die noch nicht im Projekt sind.</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            type="search"
            autoFocus
            aria-label="Personen suchen"
            placeholder="Suchen…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className={cn(inputClass, "w-full pl-8")}
          />
        </div>
        <ul aria-label="Personen" className="max-h-80 divide-y overflow-y-auto rounded-md border">
          {users === null && <li className="px-3 py-2 text-sm text-muted-foreground">Lädt…</li>}
          {users?.length === 0 && <li className="px-3 py-2 text-sm text-muted-foreground">Niemand gefunden.</li>}
          {users?.map((user) => (
            <li key={user.id}>
              <button type="button" onClick={() => props.onPick(user)} className="w-full px-3 py-2 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none">
                <UserLine user={user} />
              </button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
