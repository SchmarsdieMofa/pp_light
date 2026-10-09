import { closestCorners, pointerWithin, type Collision, type CollisionDetection, type DroppableContainer } from "@dnd-kit/core";

export const COLUMN_PREFIX = "column:";

const isColumn = (id: string | number) => String(id).startsWith(COLUMN_PREFIX);

const collision = (container: DroppableContainer, value: number): Collision => ({
  id: container.id,
  data: { droppableContainer: container, value },
});

/**
 * The column the pointer is in. The 16px gap between two columns hits no droppable: there the column with the nearest
 * horizontal extent counts – as long as the pointer is still over the board (null when it is not).
 */
function columnUnderPointer(args: Parameters<CollisionDetection>[0], hits: Collision[]): Collision | null {
  const hit = hits.find((h) => isColumn(h.id));
  if (hit) return hit;
  const { pointerCoordinates, droppableRects, droppableContainers } = args;
  if (!pointerCoordinates) return null;
  const columns = droppableContainers.flatMap((container) => {
    const rect = droppableRects.get(container.id);
    return isColumn(container.id) && rect ? [{ container, rect }] : [];
  });
  if (columns.length === 0) return null;
  const { x, y } = pointerCoordinates;
  const top = Math.min(...columns.map(({ rect }) => rect.top));
  const bottom = Math.max(...columns.map(({ rect }) => rect.bottom));
  const left = Math.min(...columns.map(({ rect }) => rect.left));
  const right = Math.max(...columns.map(({ rect }) => rect.right));
  if (y < top || y > bottom || x < left || x > right) return null;
  const nearest = columns
    .map(({ container, rect }) => ({ container, distance: Math.max(rect.left - x, x - rect.right, 0) }))
    .sort((a, b) => a.distance - b.distance)[0];
  return collision(nearest.container, nearest.distance);
}

/**
 * Which column or card the drop lands on: the one under the pointer. dnd-kit's rectangle-based detectors compare
 * the dragged card's corners with their targets – with columns as wide as on a 34" monitor the grabbed card then
 * hangs far out of the column the pointer is in, and a neighbour's corners are closer. Keyboard drags have no pointer
 * and keep the corner comparison. A pointer outside the board resolves to nothing: the drop is cancelled.
 */
export const collisionUnderPointer: CollisionDetection = (args) => {
  const { pointerCoordinates, droppableRects, droppableContainers } = args;
  if (!pointerCoordinates) return closestCorners(args);
  const hits = pointerWithin(args);
  // A card under the pointer wins over the column that holds it.
  const card = hits.find((hit) => !isColumn(hit.id));
  if (card) return [card];
  const column = columnUnderPointer(args, hits);
  if (!column) return [];
  const columnId = String(column.id).slice(COLUMN_PREFIX.length);
  // Pointer in the column but between cards (or above/below them): the card nearest to it, so the drop lands in
  // that slot; below the last card the column itself stands for "to the end".
  const cardsInColumn = droppableContainers.flatMap((container) => {
    const rect = droppableRects.get(container.id);
    const inColumn = !isColumn(container.id) && container.data.current?.sortable?.containerId === columnId;
    return inColumn && rect ? [{ container, rect }] : [];
  });
  if (cardsInColumn.length === 0) return [column];
  const lastBottom = Math.max(...cardsInColumn.map(({ rect }) => rect.bottom));
  if (pointerCoordinates.y > lastBottom) return [column];
  const nearest = cardsInColumn
    .map(({ container, rect }) => ({ container, distance: Math.abs(rect.top + rect.height / 2 - pointerCoordinates.y) }))
    .sort((a, b) => a.distance - b.distance)[0];
  return [collision(nearest.container, nearest.distance)];
};
