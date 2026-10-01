import { describe, expect, it } from "vitest";
import { chartDate, earlierStartIds, exclusiveEnd, inclusiveDue, isoDate, toChartData } from "@/lib/gantt";
import type { GanttData } from "@/server/gantt/queries";

const data: GanttData = {
  phases: [{ id: "phase-1", name: "Planung", startDate: null, endDate: null, isMilestone: false },
    { id: "phase-2", name: "Freigabe", startDate: "2026-10-09", endDate: "2026-10-09", isMilestone: true }],
  tasks: [
    { id: "a", parentId: null, phaseId: "phase-1", number: 1, title: "Konzept", startDate: "2026-10-01", dueDate: "2026-10-02", updatedAt: "2026-10-01T00:00:00.000Z", isDone: false },
    { id: "b", parentId: null, phaseId: "phase-1", number: 2, title: "Prüfung", startDate: "2026-10-06", dueDate: "2026-10-07", updatedAt: "2026-10-01T00:00:00.000Z", isDone: false },
    { id: "c", parentId: null, phaseId: null, number: 3, title: "Ohne Termin", startDate: null, dueDate: null, updatedAt: "2026-10-01T00:00:00.000Z", isDone: false },
  ],
  links: [{ blockerId: "a", blockedId: "b", lagDays: 0 }],
};

describe("Gantt adapter", () => {
  it("maps inclusive app dates to exclusive chart dates across a weekend", () => {
    expect(isoDate(exclusiveEnd("2026-10-02"))).toBe("2026-10-03");
    expect(inclusiveDue(chartDate("2026-10-03"))).toBe("2026-10-02");
  });

  it("groups dated tasks, keeps undated tasks separate and shows milestone and link", () => {
    const chart = toChartData(data, "DEMO");
    expect(chart.tasks.map((task) => [task.id, task.parent, task.type])).toEqual([
      ["phase:phase-1", undefined, "summary"],
      ["a", "phase:phase-1", "task"],
      ["b", "phase:phase-1", "task"],
      ["phase:phase-2", undefined, "milestone"],
    ]);
    expect(chart.links).toEqual([{ id: "a:b", source: "a", target: "b", type: "e2s" }]);
    expect(chart.unscheduled.map((task) => task.id)).toEqual(["c"]);
  });

  it("marks a successor with slack without moving it forward", () => {
    expect([...earlierStartIds(data)]).toEqual(["b"]);
    expect(data.tasks[1].startDate).toBe("2026-10-06");
  });
});
