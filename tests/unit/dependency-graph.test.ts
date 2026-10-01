import { describe, expect, it } from "vitest";
import { topologicalOrder, wouldCreateCycle } from "@/lib/dependency-graph";

describe("dependency graph", () => {
  it("sorts a diamond so every blocker precedes its successor", () => {
    const edges = [
      { blockerId: "a", blockedId: "b" },
      { blockerId: "a", blockedId: "c" },
      { blockerId: "b", blockedId: "d" },
      { blockerId: "c", blockedId: "d" },
    ];
    expect(topologicalOrder(["a", "b", "c", "d"], edges)).toEqual(["a", "b", "c", "d"]);
    expect(wouldCreateCycle(edges, "d", "a")).toBe(true);
    expect(wouldCreateCycle(edges, "d", "e")).toBe(false);
    expect(wouldCreateCycle(edges, "a", "a")).toBe(true);
  });

  it("rejects an existing cycle and unknown nodes", () => {
    expect(() => topologicalOrder(["a", "b"], [{ blockerId: "a", blockedId: "b" }, { blockerId: "b", blockedId: "a" }])).toThrow();
    expect(() => topologicalOrder(["a"], [{ blockerId: "a", blockedId: "b" }])).toThrow();
  });

  it("handles a long chain without recursion", () => {
    const ids = Array.from({ length: 5_000 }, (_, i) => String(i));
    const edges = ids.slice(1).map((id, i) => ({ blockerId: ids[i], blockedId: id }));
    expect(topologicalOrder(ids, edges)).toEqual(ids);
    expect(wouldCreateCycle(edges, ids.at(-1)!, ids[0])).toBe(true);
  });
});
