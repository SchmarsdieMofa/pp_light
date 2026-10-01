import { describe, expect, it } from "vitest";
import { applyMove, planMove } from "@/lib/board-move";
import { initials } from "@/lib/initials";

const cards = [
  { id: "a", statusId: "open" },
  { id: "b", statusId: "open" },
  { id: "c", statusId: "open" },
  { id: "x", statusId: "doing" },
];

describe("planMove", () => {
  it("moves down within a column (after the card dropped on)", () => {
    expect(planMove(cards, "a", { id: "c", isColumn: false })).toEqual({
      taskId: "a",
      statusId: "open",
      afterId: "c",
      beforeId: null,
    });
  });

  it("moves up within a column (before the card dropped on)", () => {
    expect(planMove(cards, "c", { id: "a", isColumn: false })).toEqual({
      taskId: "c",
      statusId: "open",
      afterId: null,
      beforeId: "a",
    });
  });

  it("inserts before the target card in another column", () => {
    expect(planMove(cards, "b", { id: "x", isColumn: false })).toEqual({
      taskId: "b",
      statusId: "doing",
      afterId: null,
      beforeId: "x",
    });
  });

  it("appends when dropped on a column", () => {
    expect(planMove(cards, "a", { id: "doing", isColumn: true })).toEqual({
      taskId: "a",
      statusId: "doing",
      afterId: "x",
      beforeId: null,
    });
    expect(planMove(cards, "x", { id: "done", isColumn: true })).toEqual({
      taskId: "x",
      statusId: "done",
      afterId: null,
      beforeId: null,
    });
  });

  it("returns null when nothing changes or the ids are unknown", () => {
    expect(planMove(cards, "b", { id: "b", isColumn: false })).toBeNull();
    expect(planMove(cards, "c", { id: "open", isColumn: true })).toBeNull();
    expect(planMove(cards, "zzz", { id: "a", isColumn: false })).toBeNull();
    expect(planMove(cards, "a", { id: "zzz", isColumn: false })).toBeNull();
  });
});

describe("applyMove", () => {
  it("reorders for the optimistic view", () => {
    const plan = planMove(cards, "a", { id: "x", isColumn: false })!;
    expect(applyMove(cards, plan).map((c) => `${c.id}:${c.statusId}`)).toEqual(["b:open", "c:open", "a:doing", "x:doing"]);
    const down = planMove(cards, "a", { id: "c", isColumn: false })!;
    expect(applyMove(cards, down).map((c) => c.id)).toEqual(["b", "c", "a", "x"]);
    const empty = planMove(cards, "x", { id: "done", isColumn: true })!;
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
