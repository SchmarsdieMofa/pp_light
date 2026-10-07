import { describe, expect, it } from "vitest";
import { applyMove, planDrop, previewMove } from "@/lib/board-move";
import { initials } from "@/lib/initials";

const cards = [
  { id: "a", statusId: "open" },
  { id: "b", statusId: "open" },
  { id: "c", statusId: "open" },
  { id: "x", statusId: "doing" },
];

/** A full drag: the live preview first; once the card has jumped columns the pointer is over the card itself. */
const dropPlan = (list: typeof cards, activeId: string, over: { id: string; isColumn: boolean }) => {
  const live = previewMove(list, activeId, over);
  return planDrop(list, live, activeId, live === list ? over : { id: activeId, isColumn: false });
};

describe("planDrop", () => {
  it("moves down within a column (after the card dropped on)", () => {
    expect(dropPlan(cards, "a", { id: "c", isColumn: false })).toEqual({
      taskId: "a",
      statusId: "open",
      afterId: "c",
      beforeId: null,
    });
  });

  it("moves up within a column (before the card dropped on)", () => {
    expect(dropPlan(cards, "c", { id: "a", isColumn: false })).toEqual({
      taskId: "c",
      statusId: "open",
      afterId: null,
      beforeId: "a",
    });
  });

  it("inserts before the target card in another column", () => {
    expect(dropPlan(cards, "b", { id: "x", isColumn: false })).toEqual({
      taskId: "b",
      statusId: "doing",
      afterId: null,
      beforeId: "x",
    });
  });

  it("appends when dropped on a column", () => {
    expect(dropPlan(cards, "a", { id: "doing", isColumn: true })).toEqual({
      taskId: "a",
      statusId: "doing",
      afterId: "x",
      beforeId: null,
    });
    expect(dropPlan(cards, "x", { id: "done", isColumn: true })).toEqual({
      taskId: "x",
      statusId: "done",
      afterId: null,
      beforeId: null,
    });
  });

  it("returns null when nothing changes or the ids are unknown", () => {
    expect(dropPlan(cards, "b", { id: "b", isColumn: false })).toBeNull();
    expect(dropPlan(cards, "c", { id: "open", isColumn: true })).toBeNull();
    expect(dropPlan(cards, "zzz", { id: "a", isColumn: false })).toBeNull();
    expect(dropPlan(cards, "a", { id: "zzz", isColumn: false })).toBeNull();
  });
});

describe("previewMove", () => {
  it("moves the card into the hovered column before the card it is over", () => {
    expect(previewMove(cards, "b", { id: "x", isColumn: false }).map((c) => `${c.id}:${c.statusId}`)).toEqual(["a:open", "c:open", "b:doing", "x:doing"]);
  });

  it("appends to a hovered column and leaves same-column hovers to dnd-kit", () => {
    expect(previewMove(cards, "a", { id: "done", isColumn: true }).map((c) => `${c.id}:${c.statusId}`)).toEqual(["b:open", "c:open", "x:doing", "a:done"]);
    expect(previewMove(cards, "a", { id: "c", isColumn: false })).toBe(cards);
    expect(previewMove(cards, "a", { id: "a", isColumn: false })).toBe(cards);
  });
});

describe("planDrop after a live preview", () => {
  it("still sends the move when the card is dropped on itself in its new column", () => {
    const live = previewMove(cards, "a", { id: "x", isColumn: false });
    expect(planDrop(cards, live, "a", { id: "a", isColumn: false })).toEqual({ taskId: "a", statusId: "doing", afterId: null, beforeId: "x" });
  });

  it("takes the slot of another card in the new column that is dropped on", () => {
    const withTwo = [...cards, { id: "y", statusId: "doing" }];
    const live = previewMove(withTwo, "a", { id: "y", isColumn: false });
    expect(planDrop(withTwo, live, "a", { id: "x", isColumn: false })).toEqual({ taskId: "a", statusId: "doing", afterId: null, beforeId: "x" });
  });

  it("is a no-op when the card went away and came back", () => {
    const away = previewMove(cards, "b", { id: "x", isColumn: false });
    const back = previewMove(away, "b", { id: "c", isColumn: false });
    expect(planDrop(cards, back, "b", { id: "b", isColumn: false })).toBeNull();
  });
});

describe("applyMove", () => {
  it("reorders for the optimistic view", () => {
    const move = dropPlan(cards, "a", { id: "x", isColumn: false })!;
    expect(applyMove(cards, move).map((c) => `${c.id}:${c.statusId}`)).toEqual(["b:open", "c:open", "a:doing", "x:doing"]);
    const down = dropPlan(cards, "a", { id: "c", isColumn: false })!;
    expect(applyMove(cards, down).map((c) => c.id)).toEqual(["b", "c", "a", "x"]);
    const empty = dropPlan(cards, "x", { id: "done", isColumn: true })!;
    expect(applyMove(cards, empty).map((c) => `${c.id}:${c.statusId}`)).toEqual(["a:open", "b:open", "c:open", "x:done"]);
  });
});

describe("initials", () => {
  it("takes the first letters of up to two words", () => {
    expect(initials("Ada Lovelace")).toBe("AL");
    expect(initials("  mia ")).toBe("M");
    expect(initials("Jean-Luc de Picard")).toBe("JD");
    expect(initials("")).toBe("?");
  });
});
