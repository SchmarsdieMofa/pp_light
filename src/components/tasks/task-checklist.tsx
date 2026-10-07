"use client";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, X } from "lucide-react";
import { useId, useOptimistic, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  addChecklistItemAction,
  deleteChecklistItemAction,
  reorderChecklistAction,
  toggleChecklistItemAction,
  updateChecklistItemTextAction,
} from "@/app/(app)/tasks/actions";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import type { ActionResult } from "@/server/action-result";
import type { TaskDetail } from "@/server/tasks/queries";

type Item = TaskDetail["checklist"][number];
type Change = { type: "done"; id: string; done: boolean } | { type: "text"; id: string; text: string } | { type: "order"; ids: string[] };

function applyChange(current: Item[], change: Change): Item[] {
  switch (change.type) {
    case "done":
      return current.map((item) => (item.id === change.id ? { ...item, done: change.done } : item));
    case "text":
      return current.map((item) => (item.id === change.id ? { ...item, text: change.text } : item));
    case "order":
      return change.ids.map((id) => current.find((item) => item.id === id)).filter((item): item is Item => !!item);
  }
}

export function TaskChecklist({ detail }: { detail: TaskDetail }) {
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();
  // Checkbox, text and order follow the interaction immediately; the server result replaces them after revalidation.
  const [items, change] = useOptimistic(detail.checklist, applyChange);
  const done = items.filter((i) => i.done).length;
  // Stable id: dnd-kit's own counter differs between server and client render (hydration mismatch).
  const dndId = useId();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function run(action: () => Promise<ActionResult<void>>, onOk?: () => void, optimistic?: () => void) {
    startTransition(async () => {
      optimistic?.();
      const res = await action();
      if (!res.ok) toast.error(res.error.fieldErrors ? "Text fehlt" : res.error.message);
      else onOk?.();
    });
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const ids = items.map((item) => item.id);
    const next = arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id)));
    run(
      () => reorderChecklistAction(detail.id, next),
      undefined,
      () => change({ type: "order", ids: next }),
    );
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
      <DndContext id={dndId} sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
          <ul className="space-y-1">
            {items.map((item) => (
              <ChecklistRow
                key={item.id}
                item={item}
                canEdit={detail.canEdit}
                onToggle={(checked) =>
                  run(
                    () => toggleChecklistItemAction(item.id, checked),
                    undefined,
                    () => change({ type: "done", id: item.id, done: checked }),
                  )
                }
                onRename={(next) =>
                  run(
                    () => updateChecklistItemTextAction(item.id, next),
                    undefined,
                    () => change({ type: "text", id: item.id, text: next }),
                  )
                }
                onDelete={() => run(() => deleteChecklistItemAction(item.id))}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
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

function ChecklistRow(props: {
  item: Item;
  canEdit: boolean;
  onToggle: (checked: boolean) => void;
  onRename: (text: string) => void;
  onDelete: () => void;
}) {
  const { item, canEdit } = props;
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: !canEdit,
  });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.text);
  // Esc leaves without saving, but the field still blurs on its way out.
  const cancelled = useRef(false);

  function startEditing() {
    cancelled.current = false;
    setDraft(item.text);
    setEditing(true);
  }

  function commit() {
    setEditing(false);
    const next = draft.trim();
    if (cancelled.current || !next || next === item.text) return;
    props.onRename(next);
  }

  const textClass = item.done ? "text-muted-foreground line-through" : "";
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`group flex items-center gap-2 rounded-sm bg-background text-sm ${isDragging ? "relative z-10 shadow-md" : ""}`}
    >
      {canEdit && (
        <button
          type="button"
          ref={setActivatorNodeRef}
          aria-label={`${item.text} verschieben`}
          className="-ml-1 touch-none cursor-grab text-muted-foreground/60 hover:text-foreground focus-visible:text-foreground active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-3.5" />
        </button>
      )}
      <Checkbox aria-label={item.text} checked={item.done} disabled={!canEdit} onCheckedChange={(checked) => props.onToggle(checked)} />
      {editing ? (
        <Input
          aria-label={`${item.text} bearbeiten`}
          autoFocus
          value={draft}
          maxLength={300}
          className="h-7 flex-1"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.blur();
            } else if (e.key === "Escape") {
              // Marks the Esc as used, so the task overlay stays open.
              e.preventDefault();
              cancelled.current = true;
              e.currentTarget.blur();
            }
          }}
        />
      ) : canEdit ? (
        <button
          type="button"
          title="Zum Bearbeiten klicken"
          className={`min-w-0 flex-1 rounded-sm px-1 text-left [overflow-wrap:anywhere] hover:bg-muted/60 ${textClass}`}
          onClick={startEditing}
        >
          {item.text}
        </button>
      ) : (
        <span className={`min-w-0 flex-1 px-1 [overflow-wrap:anywhere] ${textClass}`}>{item.text}</span>
      )}
      {canEdit && (
        <button
          type="button"
          aria-label={`${item.text} löschen`}
          className="ml-auto text-muted-foreground opacity-0 group-hover:opacity-100 focus:opacity-100"
          onClick={props.onDelete}
        >
          <X className="size-3" />
        </button>
      )}
    </li>
  );
}
