import { describe, expect, it } from "vitest";
import { describeActivity, type ActivityLookup } from "@/lib/activity-text";

const lookup: ActivityLookup = {
  users: new Map([["u1", "Ada"], ["u2", "Mia"]]),
  statuses: new Map([["s1", "Offen"], ["s2", "In Arbeit"]]),
  phases: new Map([["p1", "Planung"]]),
  labels: new Map([["l1", "Design"]]),
  tasks: new Map([["t1", "WEB-1 Header"]]),
};

describe("describeActivity", () => {
  it("describes creation, comments and attachments", () => {
    expect(describeActivity("task.created", {}, lookup)).toBe("hat die Aufgabe angelegt");
    expect(describeActivity("comment.added", {}, lookup)).toBe("hat kommentiert");
    expect(describeActivity("attachment.added", { filename: "plan.pdf" }, lookup)).toBe("hat „plan.pdf“ angehängt");
    expect(describeActivity("attachment.removed", { filename: "plan.pdf" }, lookup)).toBe("hat „plan.pdf“ entfernt");
  });

  it("lists field changes with readable values", () => {
    expect(
      describeActivity(
        "task.updated",
        {
          title: ["Alt", "Neu"],
          statusId: ["s1", "s2"],
          priority: ["none", "high"],
          dueDate: [null, "2026-10-14"],
          phaseId: [null, "p1"],
          description: ["a", "b"],
        },
        lookup,
      ),
    ).toBe("hat geändert: Titel „Alt“ → „Neu“ · Status Offen → In Arbeit · Priorität Keine → Hoch · Fällig – → 14.10.2026 · Phase – → Planung · Beschreibung");
  });

  it("describes moves, schedule cascades and dependencies", () => {
    expect(describeActivity("task.moved", { statusId: ["s1", "s2"] }, lookup)).toBe("hat den Status von Offen auf In Arbeit gesetzt");
    expect(
      describeActivity(
        "task.autoMoved",
        { before: { startDate: "2026-10-05", dueDate: "2026-10-06" }, after: { startDate: "2026-10-07", dueDate: "2026-10-08" } },
        lookup,
      ),
    ).toBe("Termin automatisch verschoben: 05.10.2026–06.10.2026 → 07.10.2026–08.10.2026");
    expect(describeActivity("dependency.added", { blockerId: "t1", lagDays: 2 }, lookup)).toBe("wartet jetzt auf WEB-1 Header (+2 Arbeitstage)");
    expect(describeActivity("dependency.removed", { blockerId: "t1" }, lookup)).toBe("wartet nicht mehr auf WEB-1 Header");
    expect(describeActivity("schedule.undone", {}, lookup)).toBe("hat eine Terminverschiebung rückgängig gemacht");
  });

  it("describes assignee and label changes", () => {
    expect(describeActivity("task.assigneesChanged", { added: ["u1"], removed: ["u2"] }, lookup)).toBe("Zuständig: +Ada, −Mia");
    expect(describeActivity("task.labelsChanged", { added: ["l1"], removed: [] }, lookup)).toBe("Labels: +Design");
  });

  it("hides duplicates and unknown entries instead of failing", () => {
    expect(describeActivity("schedule.changed", { before: {}, after: {} }, lookup)).toBeNull();
    expect(describeActivity("something.new", {}, lookup)).toBeNull();
    expect(describeActivity("task.moved", { statusId: ["gone", "s2"] }, lookup)).toBe("hat den Status von (gelöscht) auf In Arbeit gesetzt");
  });
});
