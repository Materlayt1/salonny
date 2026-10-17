/** Explicit business wall-clock input; never interpret it in device timezone. */
export function waitlistLocalInput(instant: Date | string, timezone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(instant));
    const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
    return `${value("year")}-${value("month")}-${value("day")} ${value("hour")}:${value("minute")}`;
  } catch {
    // Invalid server configuration must not crash native rendering or silently
    // fall back to device time. Blank input cannot pass strict form validation.
    return "";
  }
}

export function waitlistInputToIso(value: string, timezone: string): string | null {
  const text = value.trim();
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(text)) return null;
  const wallTime = Date.parse(`${text.replace(" ", "T")}:00Z`);
  if (!Number.isFinite(wallTime) || new Date(wallTime).toISOString().slice(0, 16).replace("T", " ") !== text) return null;
  try {
    let instant = wallTime;
    for (let attempt = 0; attempt < 3; attempt++) {
      const projected = Date.parse(`${waitlistLocalInput(new Date(instant), timezone).replace(" ", "T")}:00Z`);
      instant += wallTime - projected;
    }
    if (waitlistLocalInput(new Date(instant), timezone) !== text) return null;
    // Reject modern DST folds instead of silently choosing an ambiguous time.
    for (const minutes of [-180, -120, -90, -60, -30, 30, 60, 90, 120, 180]) {
      if (waitlistLocalInput(new Date(instant + minutes * 60_000), timezone) === text) return null;
    }
    return new Date(instant).toISOString();
  } catch { return null; }
}
