export type TimeRange = { start: string; end: string };
export type BusyInterval = TimeRange & { status?: "pending" | "confirmed" | "completed" | "cancelled" };

function toMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function toTime(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export function rangesOverlap(left: TimeRange, right: TimeRange) {
  return toMinutes(left.start) < toMinutes(right.end) && toMinutes(right.start) < toMinutes(left.end);
}

export function buildAvailableSlots(input: {
  workingHours: TimeRange[];
  breaks?: TimeRange[];
  busy?: BusyInterval[];
  durationMinutes: number;
  bufferBeforeMinutes?: number;
  bufferAfterMinutes?: number;
  stepMinutes?: number;
}) {
  const {
    workingHours,
    breaks = [],
    busy = [],
    durationMinutes,
    bufferBeforeMinutes = 0,
    bufferAfterMinutes = 0,
    stepMinutes = 30,
  } = input;

  const blocking = [...breaks, ...busy.filter((item) => item.status !== "cancelled")];
  const slots: string[] = [];
  for (const period of workingHours) {
    const end = toMinutes(period.end);
    for (let cursor = toMinutes(period.start); cursor + durationMinutes <= end; cursor += stepMinutes) {
      const occupied = { start: toTime(cursor - bufferBeforeMinutes), end: toTime(cursor + durationMinutes + bufferAfterMinutes) };
      if (!blocking.some((range) => rangesOverlap(occupied, range))) slots.push(toTime(cursor));
    }
  }
  return slots;
}
