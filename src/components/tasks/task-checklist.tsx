"use client";

import { X } from "lucide-react";
import { useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  addChecklistItemAction,
  deleteChecklistItemAction,
  toggleChecklistItemAction,
} from "@/app/(app)/tasks/actions";
import { Input } from "@/components/ui/input";
import type { ActionResult } from "@/server/action-result";
import type { TaskDetail } from "@/server/tasks/queries";

export function TaskChecklist({ detail }: { detail: TaskDetail }) {
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();
  // Checkbox state follows the click immediately; the server result replaces it after revalidation.
  const [items, setItemDone] = useOptimistic(detail.checklist, (current, change: { id: string; done: boolean }) =>
    current.map((item) => (item.id === change.id ? { ...item, done: change.done } : item)),
  );
  const done = items.filter((i) => i.done).length;

  function run(action: () => Promise<ActionResult<void>>, onOk?: () => void, optimistic?: () => void) {
    startTransition(async () => {
      optimistic?.();
      const res = await action();
      if (!res.ok) toast.error(res.error.fieldErrors ? "Text fehlt" : res.error.message);
      else onOk?.();
    });
  }

  return (
    <section aria-label="Checkliste" className="space-y-2">
      <h3 className="text-sm font-medium">
        Checkliste{" "}
        {items.length > 0 && (
          <span className="text-muted-foreground">
            {done}/{items.length}
          </span>
        )}
      </h3>
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.id} className="group flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              aria-label={item.text}
              checked={item.done}
              disabled={!detail.canEdit}
              onChange={(e) => {
                const checked = e.target.checked;
                run(
                  () => toggleChecklistItemAction(item.id, checked),
                  undefined,
                  () => setItemDone({ id: item.id, done: checked }),
                );
              }}
            />
            <span className={item.done ? "text-muted-foreground line-through" : undefined}>{item.text}</span>
            {detail.canEdit && (
              <button
                type="button"
                aria-label={`${item.text} löschen`}
                className="ml-auto text-muted-foreground opacity-0 group-hover:opacity-100 focus:opacity-100"
                onClick={() => run(() => deleteChecklistItemAction(item.id))}
              >
                <X className="size-3" />
              </button>
            )}
          </li>
        ))}
      </ul>
      {detail.canEdit && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!text.trim()) return;
            run(
              () => addChecklistItemAction(detail.id, text),
              () => setText(""),
            );
          }}
        >
          <Input
            aria-label="Neuer Checklisten-Punkt"
            placeholder="Punkt hinzufügen… (Enter)"
            value={text}
            maxLength={300}
            readOnly={pending}
            onChange={(e) => setText(e.target.value)}
            className="h-8"
          />
        </form>
      )}
    </section>
  );
}
