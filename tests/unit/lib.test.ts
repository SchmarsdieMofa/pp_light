import { describe, expect, it } from "vitest";
import { formatDate, isOverdue, todayIso } from "@/lib/dates";
import { parseTaskListParams } from "@/lib/task-list-params";
import { buildHref, normalizeSearchParams } from "@/lib/urls";

describe("dates", () => {
  it("formats ISO dates the German way", () => {
    expect(formatDate("2026-10-14")).toBe("14.10.2026");
    expect(formatDate(null)).toBe("");
  });

  it("uses the local calendar day for today", () => {
    expect(todayIso(new Date(2026, 0, 5, 23, 30))).toBe("2026-01-05");
  });

  it("flags overdue only for open tasks with a past due date", () => {
    expect(isOverdue("2026-10-01", false, "2026-10-02")).toBe(true);
    expect(isOverdue("2026-10-02", false, "2026-10-02")).toBe(false);
    expect(isOverdue("2026-10-01", true, "2026-10-02")).toBe(false);
    expect(isOverdue(null, false, "2026-10-02")).toBe(false);
  });
});

describe("urls", () => {
  it("keeps the first value of repeated params and drops empty ones", () => {
    expect(normalizeSearchParams({ a: ["1", "2"], b: "", c: undefined, d: "x" })).toEqual({ a: "1", d: "x" });
  });

  it("sets and removes params while keeping the rest", () => {
    expect(buildHref("/p/1/list", { status: "s1", task: "t1" }, { task: "t2" })).toBe("/p/1/list?status=s1&task=t2");
    expect(buildHref("/p/1/list", { status: "s1", task: "t1" }, { task: null })).toBe("/p/1/list?status=s1");
    expect(buildHref("/p/1/list", {}, { task: null })).toBe("/p/1/list");
  });

  it("encodes values", () => {
    expect(buildHref("/x", {}, { q: "a&b c" })).toBe("/x?q=a%26b+c");
  });
});

describe("parseTaskListParams", () => {
  const uuid = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

  it("defaults to sorting by number ascending without filters", () => {
    expect(parseTaskListParams({})).toEqual({ filters: {}, sort: { field: "number", dir: "asc" } });
  });

  it("accepts valid filters and sort", () => {
    expect(
      parseTaskListParams({ status: uuid, assignee: uuid, label: uuid, priority: "high", q: " logo ", sort: "dueDate", dir: "desc" }),
    ).toEqual({
      filters: { statusId: uuid, assigneeId: uuid, labelId: uuid, priority: "high", q: "logo" },
      sort: { field: "dueDate", dir: "desc" },
    });
  });

  it("ignores invalid values instead of failing", () => {
    expect(parseTaskListParams({ status: "abc", priority: "mega", sort: "drop table", dir: "up", q: "   " })).toEqual({
      filters: {},
      sort: { field: "number", dir: "asc" },
    });
  });
});
