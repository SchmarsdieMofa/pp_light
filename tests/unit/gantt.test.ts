import { describe, expect, it } from "vitest";
import type { GanttResource } from "@/components/reui/gantt/gantt-types";
import { chartDate, earlierStartIds, exclusiveEnd, inclusiveDue, initialDate, isoDate, toChartData } from "@/lib/gantt";
import type { GanttData } from "@/server/gantt/queries";

/** Tree as [id, children] pairs, leaves as plain ids. */
function tree(nodes: GanttResource[]): unknown[] {
  return nodes.map((node) => (node.children ? [node.id, tree(node.children)] : node.id));
}

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

  it("groups dated tasks, keeps undated tasks separate and shows milestone and dependency", () => {
    const chart = toChartData(data, "DEMO");
    expect(tree(chart.resources)).toEqual([["phase:phase-1", ["a", "b"]], "phase:phase-2"]);
    const byId = new Map(chart.events.map((event) => [event.id, event]));
    expect(byId.get("b")?.dependencies).toEqual(["a"]);
    expect(byId.get("a")?.title).toBe("DEMO-1 Konzept");
    expect([isoDate(byId.get("a")!.start), isoDate(byId.get("a")!.end)]).toEqual(["2026-10-01", "2026-10-03"]);
    const milestone = byId.get("phase:phase-2")!;
    expect([milestone.data?.kind, milestone.readOnly, milestone.start.getTime() === milestone.end.getTime()]).toEqual(["milestone", true, true]);
    expect(chart.rows.get("b")).toEqual({ kind: "task", startLabel: "06.10.2026", dueLabel: "07.10.2026", hint: "Könnte früher starten" });
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
  it("lets subtasks inherit the parent's phase and nests them under the parent", () => {
    const chart = toChartData(
      {
        phases: [{ id: "p", name: "P", startDate: null, endDate: null, isMilestone: false }],
        tasks: [t({ id: "parent", phaseId: "p" }), t({ id: "child", parentId: "parent", number: 2 })],
        links: [],
      },
      "K",
    );
    expect(tree(chart.resources)).toEqual([["phase:p", [["parent", ["child"]]]]]);
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
    expect(tree(chart.resources)).toEqual([["phase:m", ["milestone:m", "a"]]]);
    expect(chart.events.find((event) => event.id === "milestone:m")?.data?.kind).toBe("milestone");
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
    const empty = chart.events.find((event) => event.id === "phase:e")!;
    expect([isoDate(empty.start), isoDate(empty.end), empty.readOnly]).toEqual(["2026-11-02", "2026-11-07", true]);
    expect(tree(chart.resources)).toEqual(["phase:e", ["phase:unassigned", ["free"]]]);
  });

  it("drops links to undated tasks", () => {
    const chart = toChartData(
      { phases: [], tasks: [t({ id: "a" }), t({ id: "b", startDate: null, dueDate: null })], links: [{ blockerId: "a", blockedId: "b", lagDays: 0 }] },
      "K",
    );
    expect(chart.events.find((event) => event.id === "a")?.dependencies).toBeUndefined();
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

describe("Gantt opening position", () => {
  const events = [{ start: chartDate("2026-10-05"), end: chartDate("2026-10-20") }];

  it("opens on today while today lies inside the plan", () => {
    const now = chartDate("2026-10-10");
    expect(initialDate(events, now)).toBe(now);
  });

  it("opens on the first planned day when today is outside the plan", () => {
    expect(isoDate(initialDate(events, chartDate("2027-01-01")))).toBe("2026-10-05");
  });
});
