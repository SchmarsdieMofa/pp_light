import { describe, expect, it } from "vitest";
import { formatDate, isOverdue, isPlausibleDate, todayIso } from "@/lib/dates";
import { updateTaskSchema } from "@/lib/schemas/task";
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

describe("plausible dates", () => {
  it("rejects half-typed years from the browser date input", () => {
    expect(isPlausibleDate("0002-10-14")).toBe(false);
    expect(isPlausibleDate("0202-10-14")).toBe(false);
    expect(isPlausibleDate("2026-10-14")).toBe(true);
    expect(isPlausibleDate("3000-01-01")).toBe(false);
    expect(updateTaskSchema.safeParse({ dueDate: "0020-10-14" }).success).toBe(false);
    expect(updateTaskSchema.safeParse({ dueDate: "2026-10-14" }).success).toBe(true);
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

describe("date input", () => {
  it("parses German and ISO input into ISO days", async () => {
    const { parseDateInput } = await import("@/lib/dates");
    expect(parseDateInput("15.01.2030", "2026-10-02")).toBe("2030-01-15");
    expect(parseDateInput("5.1.30", "2026-10-02")).toBe("2030-01-05");
    expect(parseDateInput("24.12.", "2026-10-02")).toBe("2026-12-24");
    expect(parseDateInput(" 2030-01-15 ", "2026-10-02")).toBe("2030-01-15");
  });

  it("rejects impossible or implausible dates", async () => {
    const { parseDateInput } = await import("@/lib/dates");
    expect(parseDateInput("31.02.2030")).toBeNull();
    expect(parseDateInput("0202-10-14")).toBeNull();
    expect(parseDateInput("morgen")).toBeNull();
    expect(parseDateInput("")).toBeNull();
  });

  it("shifts days and finds the Monday of a week across DST", async () => {
    const { addDays, weekStart } = await import("@/lib/dates");
    expect(addDays("2026-10-24", 2)).toBe("2026-10-26");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(weekStart("2026-10-04")).toBe("2026-09-28");
    expect(weekStart("2026-09-28")).toBe("2026-09-28");
  });
});
