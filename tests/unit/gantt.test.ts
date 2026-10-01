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

const t = (over: Partial<GanttData["tasks"][number]> & { id: string }): GanttData["tasks"][number] => ({
  parentId: null,
  phaseId: null,
  number: 1,
  title: over.id,
  startDate: "2026-10-05",
  dueDate: "2026-10-06",
  updatedAt: "2026-10-01T00:00:00.000Z",
  isDone: false,
  ...over,
});

describe("Gantt adapter details", () => {
  it("keeps collapsed phases closed", () => {
    const chart = toChartData(data, "DEMO", new Set(["phase:phase-1"]));
    expect(chart.tasks.find((task) => task.id === "phase:phase-1")?.open).toBe(false);
  });

  it("lets subtasks inherit the parent's phase and nests them under the parent", () => {
    const chart = toChartData(
      {
        phases: [{ id: "p", name: "P", startDate: null, endDate: null, isMilestone: false }],
        tasks: [t({ id: "parent", phaseId: "p" }), t({ id: "child", parentId: "parent", number: 2 })],
        links: [],
      },
      "K",
    );
    expect(chart.tasks.map((task) => [task.id, task.parent])).toEqual([
      ["phase:p", undefined],
      ["parent", "phase:p"],
      ["child", "parent"],
    ]);
  });

  it("shows a milestone phase that has tasks as summary with a milestone child", () => {
    const chart = toChartData(
      {
        phases: [{ id: "m", name: "Go-Live", startDate: "2026-10-09", endDate: "2026-10-09", isMilestone: true }],
        tasks: [t({ id: "a", phaseId: "m" })],
        links: [],
      },
      "K",
    );
    expect(chart.tasks.map((task) => [task.id, task.type])).toEqual([
      ["phase:m", "summary"],
      ["milestone:m", "milestone"],
      ["a", "task"],
    ]);
  });

  it("falls back to the phase's own dates and groups tasks without phase", () => {
    const chart = toChartData(
      {
        phases: [{ id: "e", name: "Leer", startDate: "2026-11-02", endDate: "2026-11-06", isMilestone: false }],
        tasks: [t({ id: "free" })],
        links: [],
      },
      "K",
    );
    const empty = chart.tasks.find((task) => task.id === "phase:e")!;
    expect([isoDate(empty.start as Date), isoDate(empty.end as Date)]).toEqual(["2026-11-02", "2026-11-07"]);
    expect(chart.tasks.find((task) => task.id === "free")?.parent).toBe("phase:unassigned");
  });

  it("drops links to undated tasks", () => {
    const chart = toChartData(
      { phases: [], tasks: [t({ id: "a" }), t({ id: "b", startDate: null, dueDate: null })], links: [{ blockerId: "a", blockedId: "b", lagDays: 0 }] },
      "K",
    );
    expect(chart.links).toEqual([]);
  });

  it("uses the latest required start of several blockers and ignores done tasks", () => {
    const base = {
      phases: [],
      links: [
        { blockerId: "a", blockedId: "c", lagDays: 0 },
        { blockerId: "b", blockedId: "c", lagDays: 0 },
        { blockerId: "x", blockedId: "c", lagDays: 0 },
      ],
    };
    const tasks = [
      t({ id: "a", dueDate: "2026-10-01", startDate: "2026-10-01" }),
      t({ id: "b", dueDate: "2026-10-07", startDate: "2026-10-07" }),
      t({ id: "x", dueDate: null, startDate: null }),
    ];
    // Latest blocker ends Wed 07.10 → earliest start Thu 08.10: starting 08.10 has no slack.
    expect([...earlierStartIds({ ...base, tasks: [...tasks, t({ id: "c", startDate: "2026-10-08", dueDate: "2026-10-09" })] })]).toEqual([]);
    expect([...earlierStartIds({ ...base, tasks: [...tasks, t({ id: "c", startDate: "2026-10-12", dueDate: "2026-10-13" })] })]).toEqual(["c"]);
    expect(
      [...earlierStartIds({ ...base, tasks: [...tasks, t({ id: "c", startDate: "2026-10-12", dueDate: "2026-10-13", isDone: true })] })],
    ).toEqual([]);
  });

  it("round-trips dates across month end, year end and the October DST switch", () => {
    for (const due of ["2026-10-31", "2026-12-31", "2026-10-25", "2027-03-28"]) {
      expect(inclusiveDue(exclusiveEnd(due))).toBe(due);
    }
    expect(isoDate(exclusiveEnd("2026-12-31"))).toBe("2027-01-01");
  });
});
