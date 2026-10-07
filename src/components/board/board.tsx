"use client";

import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useId, useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";
import { moveTaskAction } from "@/app/(app)/tasks/actions";
import { QuickAdd } from "@/components/tasks/quick-add";
import { useTaskHref } from "@/components/tasks/use-task-href";
import { applyMove, planMove, type MovePlan } from "@/lib/board-move";
import type { CardDensity } from "@/lib/enums";
import type { TaskListRow } from "@/server/tasks/queries";
import { BoardCard } from "./board-card";

export type BoardColumn = { id: string; name: string; color: string };
type Card = TaskListRow & { statusId: string };

const COLUMN_PREFIX = "column:";

export function Board(props: {
  projectId: string;
  columns: BoardColumn[];
  cards: TaskListRow[];
  density: CardDensity;
  canEdit: boolean;
}) {
  const href = useTaskHref();
  // Stable id: dnd-kit's own counter differs between server and client render (hydration mismatch).
  const dndId = useId();
  const serverCards: Card[] = props.cards.map((c) => ({ ...c, statusId: c.status.id }));
  const [cards, applyOptimistic] = useOptimistic(serverCards, (current: Card[], plan: MovePlan) => applyMove(current, plan));
  const [activeId, setActiveId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function onDragEnd(event: DragEndEvent) {
    setActiveId(null);
    if (!event.over) return;
    const overId = String(event.over.id);
    const isColumn = overId.startsWith(COLUMN_PREFIX);
    const plan = planMove(cards, String(event.active.id), {
      id: isColumn ? overId.slice(COLUMN_PREFIX.length) : overId,
      isColumn,
    });
    if (!plan) return;
    startTransition(async () => {
      applyOptimistic(plan);
      const res = await moveTaskAction(plan.taskId, {
        statusId: plan.statusId,
        afterId: plan.afterId,
        beforeId: plan.beforeId,
      });
      if (!res.ok) toast.error(res.error.message);
    });
  }

  const activeCard = activeId ? cards.find((c) => c.id === activeId) : undefined;

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="flex flex-1 gap-4 overflow-x-auto pb-2">
        {props.columns.map((column) => (
          <Column
            key={column.id}
            column={column}
            cards={cards.filter((c) => c.statusId === column.id)}
            density={props.density}
            canEdit={props.canEdit}
            projectId={props.projectId}
            href={href}
            activeId={activeId}
          />
        ))}
      </div>
      <DragOverlay>
        {activeCard && <BoardCard card={activeCard} density={props.density} href={href(activeCard.id)} />}
      </DragOverlay>
    </DndContext>
  );
}

function Column(props: {
  column: BoardColumn;
  cards: Card[];
  density: CardDensity;
  canEdit: boolean;
  projectId: string;
  href: (id: string) => string;
  activeId: string | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: COLUMN_PREFIX + props.column.id, disabled: !props.canEdit });
  return (
    <section
      ref={setNodeRef}
      aria-label={props.column.name}
      className={`flex min-w-72 flex-1 basis-0 flex-col rounded-lg bg-muted/40 p-3 ${isOver ? "ring-2 ring-primary/30" : ""}`}
    >
      <h2 className="mb-2 flex items-center gap-2 text-sm font-medium">
        <span className="size-2 rounded-full" style={{ backgroundColor: props.column.color }} />
        {props.column.name}
        <span className="text-xs text-muted-foreground">{props.cards.length}</span>
      </h2>
      {props.canEdit && (
        <div className="mb-2">
          <QuickAdd
            projectId={props.projectId}
            statusId={props.column.id}
            placement="top"
            label={`Neue Aufgabe in ${props.column.name}`}
            placeholder="Aufgabe hinzufügen…"
          />
        </div>
      )}
      <SortableContext items={props.cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        <ul className="min-h-8 space-y-2">
          {props.cards.map((card) => (
            <SortableCard
              key={card.id}
              card={card}
              density={props.density}
              href={props.href(card.id)}
              disabled={!props.canEdit}
              dragging={props.activeId === card.id}
            />
          ))}
        </ul>
      </SortableContext>
      {props.cards.length === 0 && <p className="text-xs text-muted-foreground">Keine Aufgaben</p>}
    </section>
  );
}

function SortableCard(props: { card: Card; density: CardDensity; href: string; disabled: boolean; dragging: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: props.card.id,
    disabled: props.disabled,
  });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...(props.disabled ? {} : attributes)}
      {...(props.disabled ? {} : listeners)}
      aria-roledescription={props.disabled ? undefined : "verschiebbare Karte"}
    >
      <BoardCard card={props.card} density={props.density} href={props.href} dragging={props.dragging} />
    </li>
  );
}
