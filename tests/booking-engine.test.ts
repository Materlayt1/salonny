import { describe, expect, it } from "vitest";
import { buildAvailableSlots, rangesOverlap } from "@/lib/booking-engine";

describe("booking engine", () => {
  it("treats touching half-open intervals as non-overlapping", () => {
    expect(rangesOverlap({ start: "10:00", end: "10:30" }, { start: "10:30", end: "11:00" })).toBe(false);
  });

  it("removes breaks and active appointments from availability", () => {
    const slots = buildAvailableSlots({
      workingHours: [{ start: "09:00", end: "13:00" }],
      breaks: [{ start: "11:00", end: "11:30" }],
      busy: [{ start: "09:30", end: "10:00", status: "confirmed" }],
      durationMinutes: 30,
    });
    expect(slots).toEqual(["09:00", "10:00", "10:30", "11:30", "12:00", "12:30"]);
  });

  it("ignores cancelled appointments", () => {
    const slots = buildAvailableSlots({
      workingHours: [{ start: "09:00", end: "10:00" }],
      busy: [{ start: "09:00", end: "09:30", status: "cancelled" }],
      durationMinutes: 30,
    });
    expect(slots).toEqual(["09:00", "09:30"]);
  });

  it("respects service duration and buffers", () => {
    const slots = buildAvailableSlots({
      workingHours: [{ start: "09:00", end: "11:00" }],
      busy: [{ start: "10:00", end: "10:30", status: "pending" }],
      durationMinutes: 60,
      bufferAfterMinutes: 15,
    });
    expect(slots).toEqual([]);
  });
});
