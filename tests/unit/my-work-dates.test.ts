import { describe, expect, it } from "vitest";
import { todayInZone, weekEnd } from "@/lib/dates";
import { groupMyWork } from "@/lib/my-work";

describe("todayInZone", () => {
  it("uses the Berlin calendar day, not UTC", () => {
    // 22:30 UTC on 13 Oct is 00:30 on 14 Oct in Berlin (CEST)
    expect(todayInZone(new Date("2026-10-13T22:30:00Z"))).toBe("2026-10-14");
    // 23:30 UTC on 31 Dec is already New Year in Berlin (CET)
    expect(todayInZone(new Date("2026-12-31T23:30:00Z"))).toBe("2027-01-01");
  });
});

describe("weekEnd", () => {
  it("returns the Sunday of the ISO week", () => {
    expect(weekEnd("2026-10-14")).toBe("2026-10-18"); // Wednesday
    expect(weekEnd("2026-10-18")).toBe("2026-10-18"); // Sunday itself
    expect(weekEnd("2026-12-28")).toBe("2027-01-03"); // across the year
  });
});

describe("groupMyWork", () => {
  const task = (id: string, dueDate: string | null) => ({ id, dueDate });

  it("sorts tasks into overdue, today, this week, later and without date", () => {
    const groups = groupMyWork(
      [task("a", "2026-10-13"), task("b", "2026-10-14"), task("c", "2026-10-18"), task("d", "2026-10-19"), task("e", null), task("f", "2026-10-01")],
      "2026-10-14",
    );
    expect({
      overdue: groups.overdue.map((t) => t.id),
      today: groups.today.map((t) => t.id),
      week: groups.week.map((t) => t.id),
      later: groups.later.map((t) => t.id),
      none: groups.none.map((t) => t.id),
    }).toEqual({ overdue: ["f", "a"], today: ["b"], week: ["c"], later: ["d"], none: ["e"] });
  });
});
