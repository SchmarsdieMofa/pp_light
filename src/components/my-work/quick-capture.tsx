"use client";

import { Plus } from "lucide-react";
import { useState, useSyncExternalStore, useTransition } from "react";
import { toast } from "sonner";
import { createMyTaskAction } from "@/app/(app)/my-work/actions";
import { addDays } from "@/lib/dates";
import { cn } from "@/lib/utils";

type Project = { id: string; name: string; key: string };
const LAST_PROJECT_KEY = "pp-light:capture-project";

// The last used project is a per-browser convenience; storage may be unavailable (private mode).
const subscribeNothing = () => () => {};
function readLastProject(): string | null {
  try {
    return localStorage.getItem(LAST_PROJECT_KEY);
  } catch {
    return null;
  }
}

/** Note a task for yourself without leaving the page: project, title, optional due date, Enter. */
export function QuickCapture({ projects, today }: { projects: Project[]; today: string }) {
  const stored = useSyncExternalStore(subscribeNothing, readLastProject, () => null);
  const [picked, setPicked] = useState<string | null>(null);
  const projectId = [picked, stored].find((id) => id && projects.some((p) => p.id === id)) ?? projects[0]?.id ?? "";
  const [title, setTitle] = useState("");
  const [due, setDue] = useState<"none" | "today" | "tomorrow">("none");
  const [pending, startTransition] = useTransition();

  if (projects.length === 0) return null;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const value = title.trim();
    if (!value || pending) return;
    const dueDate = due === "today" ? today : due === "tomorrow" ? addDays(today, 1) : null;
    startTransition(async () => {
      const res = await createMyTaskAction({ projectId, title: value, dueDate });
      if (!res.ok) {
        toast.error(res.error.fieldErrors ? Object.values(res.error.fieldErrors).flat()[0] : res.error.message);
        return;
      }
      const project = projects.find((p) => p.id === projectId);
      toast.success(`${project?.key}-${res.data.number} angelegt`);
      setTitle("");
      try {
        localStorage.setItem(LAST_PROJECT_KEY, projectId);
      } catch {}
    });
  }

  return (
    <form onSubmit={submit} aria-label="Aufgabe für mich anlegen" className="rounded-xl border bg-card p-2 shadow-xs" data-quick-add>
      <div className="flex items-center gap-2">
        <Plus className="ml-1 size-4 shrink-0 text-muted-foreground" aria-hidden />
        <input
          aria-label="Neue Aufgabe für mich"
          placeholder="Was steht an? (Enter)"
          value={title}
          maxLength={200}
          readOnly={pending}
          onChange={(e) => setTitle(e.target.value)}
          className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-2 border-t pt-2 pl-1">
        <select
          aria-label="Projekt"
          value={projectId}
          onChange={(e) => setPicked(e.target.value)}
          className="h-7 max-w-48 rounded-md border bg-background px-2 text-xs"
        >
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <div role="radiogroup" aria-label="Fällig" className="flex items-center gap-0.5 rounded-md border p-0.5">
          {([["none", "Ohne Termin"], ["today", "Heute"], ["tomorrow", "Morgen"]] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={due === value}
              onClick={() => setDue(value)}
              className={cn(
                "rounded px-2 py-0.5 text-xs transition-colors",
                due === value ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="ml-auto pr-1 text-xs text-muted-foreground">wird dir zugewiesen</span>
      </div>
    </form>
  );
}
