import { describe, expect, it } from "vitest";
import { businessDateKey, calendarDayBounds, shiftCalendarDate } from "@/lib/business-calendar";
describe("business local calendar boundaries", () => {
  it("uses the branch local date rather than the UTC date", () => {
    expect(businessDateKey(new Date("2026-10-16T22:00:00Z"), "Europe/Istanbul")).toBe("2026-10-17");
    expect(calendarDayBounds("2026-10-17", "Europe/Istanbul")).toEqual({ start: "2026-10-16T21:00:00.000Z", end: "2026-10-17T21:00:00.000Z" });
  });
  it.each([["2026-03-08", 23], ["2026-11-01", 25]])("supports a DST day %s with %i hours", (date, hours) => {
    const bounds = calendarDayBounds(date, "America/New_York");
    expect(Date.parse(bounds.end) - Date.parse(bounds.start)).toBe(hours * 3600000);
  });
  it.each(["2026-02-31", "2026-13-01", "bad", "2026-1-01"])("rejects invalid local date %s", (date) => expect(() => calendarDayBounds(date,"Europe/Istanbul")).toThrow());
  it("shifts a calendar day across year/leap boundaries without local machine timezone", () => {
    expect(shiftCalendarDate("2026-01-01", -1)).toBe("2025-12-31");
    expect(shiftCalendarDate("2024-02-28", 1)).toBe("2024-02-29");
  });
});
