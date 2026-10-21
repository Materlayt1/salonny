import { z } from "zod";

export const scheduleUuid = z.string().uuid();
const clockPattern = /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,6})?)?$/;
const legacyClockPattern = /^(?:(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,6})?)?|24:00(?::00(?:\.0{1,6})?)?)$/;
const realDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < "0001-01-01") return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};
const date = z.string().refine(realDate).nullable();
export function scheduleClockMicros(value: string) {
  const [hour, minute, remainder = "0"] = value.split(":");
  const [second, fraction = ""] = remainder.split(".");
  return (Number(hour) * 3600 + Number(minute) * 60 + Number(second)) * 1_000_000 + Number(fraction.padEnd(6, "0"));
}

// Snapshots retain database precision, including legal old PostgreSQL 24:00
// endpoints. Cleanup must not require rewriting an old period to minute precision.
export const scheduleSnapshotSchema = z.object({
  weekday: z.number().int().min(0).max(6),
  startsAt: z.string().regex(legacyClockPattern),
  endsAt: z.string().regex(legacyClockPattern),
  validFrom: date,
  validUntil: date,
}).strict();
export const schedulePeriodSchema = scheduleSnapshotSchema.extend({
  startsAt: z.string().regex(clockPattern),
  endsAt: z.string().regex(clockPattern),
}).superRefine((period, context) => {
  if (scheduleClockMicros(period.startsAt) >= scheduleClockMicros(period.endsAt)) {
    context.addIssue({ code: "custom", path: ["endsAt"], message: "Bitiş başlangıçtan sonra olmalı." });
  }
  if (period.validFrom && period.validUntil) {
    if (period.validFrom > period.validUntil) {
      context.addIssue({ code: "custom", path: ["validUntil"], message: "Tarih aralığı ters olamaz." });
    } else {
      const from = new Date(`${period.validFrom}T00:00:00Z`);
      const until = new Date(`${period.validUntil}T00:00:00Z`);
      const firstDay = (from.getUTCDay() + 6) % 7;
      const distance = (period.weekday - firstDay + 7) % 7;
      if (from.getTime() + distance * 86_400_000 > until.getTime()) {
        context.addIssue({ code: "custom", path: ["validUntil"], message: "Aralık seçilen haftanın gününü içermeli." });
      }
    }
  }
});
export const schedulePeriodResultSchema = scheduleSnapshotSchema.extend({ id: scheduleUuid });
export const employeeScheduleInput = z.discriminatedUnion("action", [
  z.object({ action: z.literal("createPeriod"), employeeId: scheduleUuid, id: scheduleUuid, period: schedulePeriodSchema }).strict(),
  z.object({ action: z.literal("updatePeriod"), employeeId: scheduleUuid, id: scheduleUuid, expected: scheduleSnapshotSchema, period: schedulePeriodSchema }).strict(),
  z.object({ action: z.literal("deletePeriod"), employeeId: scheduleUuid, id: scheduleUuid, expected: scheduleSnapshotSchema }).strict(),
  z.object({ action: z.literal("setBranch"), employeeId: scheduleUuid, targetBranchId: scheduleUuid, assigned: z.boolean(), expectedAssigned: z.boolean() }).strict(),
]);

export type ScheduleSnapshot = z.infer<typeof scheduleSnapshotSchema>;
export function sameSchedulePeriod(left: ScheduleSnapshot, right: ScheduleSnapshot) {
  return left.weekday === right.weekday && left.validFrom === right.validFrom && left.validUntil === right.validUntil
    && scheduleClockMicros(left.startsAt) === scheduleClockMicros(right.startsAt)
    && scheduleClockMicros(left.endsAt) === scheduleClockMicros(right.endsAt);
}
