const timeZone = "Europe/Istanbul";

export function dateKey(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function upcomingDates(days = 14) {
  const today = new Date(`${dateKey(new Date())}T12:00:00+03:00`);
  return Array.from({ length: days }, (_, index) => new Date(today.getTime() + index * 86_400_000));
}

export function formatTime(value: string | Date) {
  return new Date(value).toLocaleTimeString("tr-TR", { timeZone, hour: "2-digit", minute: "2-digit" });
}

export function formatDate(value: string | Date) {
  return new Date(value).toLocaleDateString("tr-TR", { timeZone, weekday: "short", day: "2-digit", month: "short" });
}
