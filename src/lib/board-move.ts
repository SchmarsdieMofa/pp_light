export type BoardCardRef = { id: string; statusId: string };
export type MovePlan = { taskId: string; statusId: string; afterId: string | null; beforeId: string | null };

function move<T>(list: T[], from: number, to: number): T[] {
  const copy = [...list];
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}

/**
 * Live preview while dragging: the active card jumps into the column it hovers (before the card it is over,
 * or at the end of an empty area), so that column makes room and the drop lands where the card already is.
 * Within its own column dnd-kit's sortable strategy shifts the neighbours, nothing to do here.
 */
export function previewMove<T extends BoardCardRef>(cards: T[], activeId: string, over: { id: string; isColumn: boolean }): T[] {
  const active = cards.find((c) => c.id === activeId);
  if (!active || over.id === activeId) return cards;
  const statusId = over.isColumn ? over.id : cards.find((c) => c.id === over.id)?.statusId;
  if (!statusId || statusId === active.statusId) return cards;
  return applyMove(cards, { taskId: activeId, statusId, afterId: null, beforeId: over.isColumn ? null : over.id });
}

/**
 * Turns a drop into the target column and the new neighbours. `live` is the board as previewed while
 * dragging (the card may already sit in its new column); `original` is the board before the drag.
 * Same column: dnd-kit semantics (take the slot of the card dropped on). Returns null when nothing changed.
 */
export function planDrop(
  original: BoardCardRef[],
  live: BoardCardRef[],
  activeId: string,
  over: { id: string; isColumn: boolean },
): MovePlan | null {
  const before = original.find((c) => c.id === activeId);
  const active = live.find((c) => c.id === activeId);
  if (!before || !active) return null;
  let column = live.filter((c) => c.statusId === active.statusId).map((c) => c.id);
  if (!over.isColumn && over.id !== activeId && column.includes(over.id)) {
    column = move(column, column.indexOf(activeId), column.indexOf(over.id));
  } else if (over.isColumn && before.statusId === active.statusId) {
    // Dropped on the empty part of its own column: to the end.
    column = move(column, column.indexOf(activeId), column.length - 1);
  }
  const i = column.indexOf(activeId);
  const unchanged = before.statusId === active.statusId && original.filter((c) => c.statusId === before.statusId).findIndex((c) => c.id === activeId) === i;
  if (unchanged) return null;
  return { taskId: activeId, statusId: active.statusId, afterId: column[i - 1] ?? null, beforeId: column[i + 1] ?? null };
}

export function applyMove<T extends BoardCardRef>(cards: T[], plan: MovePlan): T[] {
  const active = cards.find((c) => c.id === plan.taskId);
  if (!active) return cards;
  const rest = cards.filter((c) => c.id !== plan.taskId);
  const moved = { ...active, statusId: plan.statusId };
  const beforeIndex = plan.beforeId ? rest.findIndex((c) => c.id === plan.beforeId) : -1;
  if (beforeIndex >= 0) return [...rest.slice(0, beforeIndex), moved, ...rest.slice(beforeIndex)];
  const afterIndex = plan.afterId ? rest.findIndex((c) => c.id === plan.afterId) : -1;
  if (afterIndex >= 0) return [...rest.slice(0, afterIndex + 1), moved, ...rest.slice(afterIndex + 1)];
  return [...rest, moved];
}
