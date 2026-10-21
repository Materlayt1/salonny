import { describe, expect, it } from "vitest";
import { employeeScheduleInput, sameSchedulePeriod, scheduleClockMicros, schedulePeriodSchema, scheduleSnapshotSchema } from "@/lib/employee-schedule-contract";

const period = { weekday: 0, startsAt: "09:00", endsAt: "18:00", validFrom: null, validUntil: null };
describe("strict employee schedule contract", () => {
  it.each(["00:00", "09:00:01", "09:00:01.000001", "23:59:59.999999"])("preserves valid microsecond clock %s", (startsAt) => {
    expect(scheduleSnapshotSchema.parse({ ...period, startsAt }).startsAt).toBe(startsAt);
  });
  it.each(["24:00", "9:00", "00:60", "23:59:60", "09:00:01.1234567", "09:00Z", "09:00:00 "])("rejects a new malformed/end-of-day clock %s", (startsAt) => {
    expect(schedulePeriodSchema.safeParse({ ...period, startsAt }).success).toBe(false);
  });
  it("accepts legal legacy midnight only in expected snapshots for cleanup", () => {
    expect(scheduleSnapshotSchema.parse({ ...period, endsAt: "24:00:00.000000" }).endsAt).toBe("24:00:00.000000");
    expect(scheduleSnapshotSchema.safeParse({ ...period, endsAt: "24:00:01" }).success).toBe(false);
    expect(schedulePeriodSchema.safeParse({ ...period, endsAt: "24:00" }).success).toBe(false);
  });
  it.each(["2026-02-30", "2025-02-29", "2026-13-01", "0000-01-01", "2026-10-11T00:00:00Z", "infinity"])("rejects impossible or nonfinite date %s", (validFrom) => {
    expect(schedulePeriodSchema.safeParse({ ...period, validFrom }).success).toBe(false);
  });
  it("accepts real leap days, open bounds and inclusive weekday endpoints", () => {
    expect(schedulePeriodSchema.safeParse({ ...period, validFrom: "2024-02-29" }).success).toBe(true);
    expect(schedulePeriodSchema.safeParse({ ...period, validUntil: "2026-10-12" }).success).toBe(true);
    expect(schedulePeriodSchema.safeParse({ ...period, validFrom: "2026-10-12", validUntil: "2026-10-12" }).success).toBe(true);
    expect(schedulePeriodSchema.safeParse({ ...period, validFrom: "2026-10-11", validUntil: "2026-10-12" }).success).toBe(true);
  });
  it("rejects empty, overnight, reversed date and zero-weekday ranges", () => {
    for (const invalid of [{ endsAt: "09:00" }, { startsAt: "22:00", endsAt: "06:00" }, { validFrom: "2026-10-12", validUntil: "2026-10-11" }, { validFrom: "2026-10-13", validUntil: "2026-10-14" }]) {
      expect(schedulePeriodSchema.safeParse({ ...period, ...invalid }).success).toBe(false);
    }
  });
  it("compares typed clocks without losing microsecond changes", () => {
    expect(scheduleClockMicros("09:00:00.000001")).toBe(32_400_000_001);
    expect(sameSchedulePeriod(period, { ...period, startsAt: "09:00:00", endsAt: "18:00:00.000000" })).toBe(true);
    expect(sameSchedulePeriod(period, { ...period, startsAt: "09:00:00.000001" })).toBe(false);
  });
  it("requires all snapshot fields and refuses ownership injection", () => {
    const id = "10000000-0000-4000-8000-000000000001";
    expect(employeeScheduleInput.safeParse({ action: "createPeriod", employeeId: id, id, period }).success).toBe(true);
    expect(employeeScheduleInput.safeParse({ action: "createPeriod", employeeId: id, id, period, business_id: id }).success).toBe(false);
    expect(employeeScheduleInput.safeParse({ action: "deletePeriod", employeeId: id, id, expected: { weekday: 0, startsAt: "09:00", endsAt: "18:00" } }).success).toBe(false);
    expect(employeeScheduleInput.safeParse({ action: "setBranch", employeeId: id, targetBranchId: id, assigned: true }).success).toBe(false);
  });
});
