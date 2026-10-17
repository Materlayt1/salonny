/** Calendar boundaries are local dates, not rolling 24-hour UTC windows. */
export function businessDateKey(value: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function shiftCalendarDate(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(value.getTime()) || value.toISOString().slice(0, 10) !== date) throw new RangeError("Geçersiz takvim günü.");
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
export function calendarDayBounds(date: string, timezone: string) {
  const next = shiftCalendarDate(date, 1);
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" });
  const key = (seconds: number) => {
    const parts = formatter.formatToParts(new Date(seconds * 1000));
    const part = (type: string) => parts.find((entry) => entry.type === type)?.value;
    return `${part("year")}-${part("month")}-${part("day")}`;
  };
  const boundary = (day: string) => {
    const center = Date.parse(`${day}T00:00:00Z`) / 1000;
    let low = center - 36 * 3600; let high = center + 36 * 3600;
    while (low < high) { const middle = Math.floor((low + high) / 2); if (key(middle) < day) low = middle + 1; else high = middle; }
    if (key(low) !== day) throw new RangeError("Bu saat diliminde takvim günü bulunamadı.");
    return new Date(low * 1000).toISOString();
  };
  return { start: boundary(date), end: boundary(next) };
}
