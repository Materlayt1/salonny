/** [start,end) intervals: simultaneous ends/starts cancel before peak is measured.
 * Test companion of the all-row database sweep, never summarize a paged subset.
 */
export function resourcePeakUnits(spans: Array<{ startsAt: string; endsAt: string }>, from: string, to: string) {
  const lower = Date.parse(from); const upper = Date.parse(to); const events = new Map<number, number>();
  if (!Number.isFinite(lower) || !Number.isFinite(upper) || upper <= lower) throw new Error("Invalid usage window");
  for (const span of spans) {
    const start = Math.max(Date.parse(span.startsAt), lower); const end = Math.min(Date.parse(span.endsAt), upper);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) continue;
    events.set(start, (events.get(start) ?? 0) + 1); events.set(end, (events.get(end) ?? 0) - 1);
  }
  let level = 0; let peak = 0;
  for (const [, delta] of [...events].sort(([a], [b]) => a - b)) { level += delta; peak = Math.max(peak, level); }
  return peak;
}
