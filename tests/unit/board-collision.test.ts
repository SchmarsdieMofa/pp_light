import type { ClientRect, CollisionDescriptor, DroppableContainer } from "@dnd-kit/core";
import { describe, expect, it } from "vitest";
import { COLUMN_PREFIX, collisionUnderPointer } from "@/lib/board-collision";

type Box = { left: number; top: number; width: number; height: number };

const rect = ({ left, top, width, height }: Box): ClientRect => ({
  left,
  top,
  width,
  height,
  right: left + width,
  bottom: top + height,
});

const container = (id: string, containerId?: string) =>
  ({
    id,
    data: { current: containerId === undefined ? {} : { sortable: { containerId } } },
    disabled: false,
    node: { current: null },
    rect: { current: null },
  }) as unknown as DroppableContainer;

// Two columns 16px apart; "todo" holds two cards with a 10px gap, "done" is empty.
const boxes: Record<string, Box> = {
  [`${COLUMN_PREFIX}todo`]: { left: 0, top: 0, width: 200, height: 600 },
  [`${COLUMN_PREFIX}done`]: { left: 216, top: 0, width: 200, height: 600 },
  c1: { left: 10, top: 50, width: 180, height: 50 },
  c2: { left: 10, top: 110, width: 180, height: 50 },
};
const containers = [
  container(`${COLUMN_PREFIX}todo`),
  container(`${COLUMN_PREFIX}done`),
  container("c1", "todo"),
  container("c2", "todo"),
];
const droppableRects = new Map(Object.entries(boxes).map(([id, box]) => [id, rect(box)]));

const detect = (pointer: { x: number; y: number } | null, dragged: Box = { left: 0, top: 0, width: 180, height: 50 }) =>
  collisionUnderPointer({
    active: { id: "dragged", data: { current: undefined }, rect: { current: { initial: null, translated: null } } },
    collisionRect: rect(dragged),
    droppableRects,
    droppableContainers: containers,
    pointerCoordinates: pointer,
  } as unknown as Parameters<typeof collisionUnderPointer>[0]);

const ids = (collisions: CollisionDescriptor[] | ReturnType<typeof detect>) => collisions.map((c) => c.id);

describe("collisionUnderPointer", () => {
  it("picks the card under the pointer", () => {
    expect(ids(detect({ x: 100, y: 130 }))).toEqual(["c2"]);
  });

  it("picks the nearest card when the pointer is in the gap between two cards", () => {
    expect(ids(detect({ x: 100, y: 103 }))).toEqual(["c1"]);
    expect(ids(detect({ x: 100, y: 108 }))).toEqual(["c2"]);
  });

  it("picks the nearest card above the first one (column header)", () => {
    expect(ids(detect({ x: 100, y: 20 }))).toEqual(["c1"]);
  });

  it("picks the column when the pointer is below its last card", () => {
    expect(ids(detect({ x: 100, y: 400 }))).toEqual([`${COLUMN_PREFIX}todo`]);
  });

  it("picks the column when it has no cards", () => {
    expect(ids(detect({ x: 300, y: 300 }))).toEqual([`${COLUMN_PREFIX}done`]);
  });

  it("assigns cards by their sortable container, not by geometry", () => {
    // c2 lies inside the "todo" rectangle but belongs to "done": below todo's only card (c1) the drop goes to the end.
    const moved = [container(`${COLUMN_PREFIX}todo`), container(`${COLUMN_PREFIX}done`), container("c1", "todo"), container("c2", "done")];
    const result = collisionUnderPointer({
      collisionRect: rect(boxes.c1),
      droppableRects,
      droppableContainers: moved,
      pointerCoordinates: { x: 100, y: 106 },
    } as unknown as Parameters<typeof collisionUnderPointer>[0]);
    expect(ids(result)).toEqual([`${COLUMN_PREFIX}todo`]);
  });

  it("resolves the gap between two columns to the nearest column", () => {
    expect(ids(detect({ x: 203, y: 300 }))).toEqual([`${COLUMN_PREFIX}todo`]);
    expect(ids(detect({ x: 212, y: 300 }))).toEqual([`${COLUMN_PREFIX}done`]);
  });

  it("cancels the drop when the pointer is outside the board", () => {
    expect(detect({ x: 100, y: 900 })).toEqual([]);
    expect(detect({ x: 300, y: -20 })).toEqual([]);
    expect(detect({ x: 700, y: 300 })).toEqual([]);
    expect(detect({ x: -40, y: 300 })).toEqual([]);
  });

  it("falls back to comparing corners without a pointer (keyboard)", () => {
    const result = detect(null, boxes[`${COLUMN_PREFIX}done`]);
    expect(ids(result)[0]).toBe(`${COLUMN_PREFIX}done`);
  });
});
