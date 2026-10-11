import { describe, expect, it } from "vitest";
import { waitlistInputToIso, waitlistLocalInput } from "../apps/mobile/lib/waitlist-time";

describe("native waitlist business wall-clock parsing", () => {
  it("uses Istanbul rather than the device timezone and formats explicit labels", () => {
    expect(waitlistInputToIso("2026-10-10 14:30", "Europe/Istanbul")).toBe("2026-10-10T11:30:00.000Z");
    expect(waitlistLocalInput("2026-10-10T11:30:00Z", "Europe/Istanbul")).toBe("2026-10-10 14:30");
    expect(waitlistInputToIso(" 2026-10-10 14:30 ", "Europe/Istanbul")).toBe("2026-10-10T11:30:00.000Z");
  });
  it("supports UTC and timezones with negative and fractional offsets", () => {
    expect(waitlistInputToIso("2026-10-10 14:30", "UTC")).toBe("2026-10-10T14:30:00.000Z");
    expect(waitlistInputToIso("2026-10-10 14:30", "America/New_York")).toBe("2026-10-10T18:30:00.000Z");
    expect(waitlistInputToIso("2026-10-10 14:30", "Asia/Kathmandu")).toBe("2026-10-10T08:45:00.000Z");
  });
  it.each(["2026-02-31 10:00", "2026-02-29 10:00", "2026-13-10 10:00", "2026-10-00 10:00", "2026-10-10 24:00", "2026-10-10 10:60", "2026-10-10T10:00", "10/10/2026 10:00", "2026-10-10 1:00", "2026-10-10 10:00Z", ""])("rejects rolled-over/invalid or ambiguous input format: %s", (value) => {
    expect(waitlistInputToIso(value, "Europe/Istanbul")).toBeNull();
  });
  it("accepts valid leap days", () => {
    expect(waitlistInputToIso("2028-02-29 10:00", "Europe/Istanbul")).toBe("2028-02-29T07:00:00.000Z");
  });
  it("rejects nonexistent and repeated US daylight-saving times", () => {
    expect(waitlistInputToIso("2026-03-08 02:30", "America/New_York")).toBeNull();
    expect(waitlistInputToIso("2026-11-01 01:30", "America/New_York")).toBeNull();
    expect(waitlistInputToIso("2026-11-01 02:30", "America/New_York")).toBe("2026-11-01T07:30:00.000Z");
  });
  it("rejects Lord Howe half-hour clock gaps and folds", () => {
    expect(waitlistInputToIso("2026-10-04 02:15", "Australia/Lord_Howe")).toBeNull();
    expect(waitlistInputToIso("2026-04-05 01:45", "Australia/Lord_Howe")).toBeNull();
  });
  it("rejects unknown timezone configurations", () => {
    expect(waitlistInputToIso("2026-10-10 10:00", "Invalid/Timezone")).toBeNull();
    expect(waitlistLocalInput("2026-10-10T10:00:00Z", "Invalid/Timezone")).toBe("");
    expect(waitlistLocalInput("not-a-date", "Europe/Istanbul")).toBe("");
  });
});
