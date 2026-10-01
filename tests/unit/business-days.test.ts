import { describe, expect, it } from "vitest";
import { addBusinessDays, businessDaysInclusive, earliestStart, endForStart } from "@/lib/business-days";

describe("business-day scheduling", () => {
  it("crosses weekends and years without local timezone shifts", () => {
    expect(addBusinessDays("2026-10-02", 1)).toBe("2026-10-05"); // Friday → Monday
    expect(addBusinessDays("2026-10-03", 1)).toBe("2026-10-05"); // Saturday → Monday
    expect(addBusinessDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("adds lag as extra workdays after the blocker", () => {
    expect(earliestStart("2026-10-02", 0)).toBe("2026-10-05");
    expect(earliestStart("2026-10-02", 2)).toBe("2026-10-07");
  });

  it("preserves the inclusive working duration when moving a successor", () => {
    expect(businessDaysInclusive("2026-10-01", "2026-10-07")).toBe(5);
    expect(endForStart("2026-10-08", 5)).toBe("2026-10-14");
    expect(businessDaysInclusive("2026-10-03", "2026-10-04")).toBe(1);
    expect(endForStart("2026-10-05", 1)).toBe("2026-10-05");
  });

  it("rejects invalid dates and durations", () => {
    expect(() => addBusinessDays("2026-02-30", 1)).toThrow();
    expect(() => addBusinessDays("2026-10-01", 1.5)).toThrow();
    expect(() => businessDaysInclusive("2026-10-08", "2026-10-01")).toThrow();
    expect(() => endForStart("2026-10-08", 0)).toThrow();
  });
});
