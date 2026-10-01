export type BoardCardRef = { id: string; statusId: string };
export type MovePlan = { taskId: string; statusId: string; afterId: string | null; beforeId: string | null };

function move<T>(list: T[], from: number, to: number): T[] {
  const copy = [...list];
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}

/**
 * Turns a drop (active card over a card or a column) into the target column and the new neighbours.
 * Same column: dnd-kit semantics (take the slot of the card dropped on). Other column: insert before that card.
 */
export function planMove(cards: BoardCardRef[], activeId: string, over: { id: string; isColumn: boolean }): MovePlan | null {
  const active = cards.find((c) => c.id === activeId);
  if (!active) return null;
  const statusId = over.isColumn ? over.id : cards.find((c) => c.id === over.id)?.statusId;
  if (!statusId) return null;

  const column = cards.filter((c) => c.statusId === statusId).map((c) => c.id);
  let order: string[];
  if (active.statusId === statusId) {
    const from = column.indexOf(activeId);
    const to = over.isColumn ? column.length - 1 : column.indexOf(over.id);
    if (from === to) return null;
    order = move(column, from, to);
  } else {
    const index = over.isColumn ? column.length : column.indexOf(over.id);
    order = [...column.slice(0, index), activeId, ...column.slice(index)];
  }
  const i = order.indexOf(activeId);
  return { taskId: activeId, statusId, afterId: order[i - 1] ?? null, beforeId: order[i + 1] ?? null };
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
