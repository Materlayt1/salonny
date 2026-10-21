/** Explicit Istanbul wall clock; never interpret user input in device timezone. */
export function istanbulInputToIso(value: string): string | null {
  const text = value.trim();
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(text)) return null;
  const instant = new Date(`${text.replace(" ", "T")}:00+03:00`);
  if (!Number.isFinite(instant.getTime())) return null;
  const roundTrip = new Date(instant.getTime() + 3 * 3_600_000).toISOString().slice(0, 16).replace("T", " ");
  return roundTrip === text ? instant.toISOString() : null;
}
