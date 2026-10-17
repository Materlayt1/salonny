import { ApiError, requestJson } from "@/lib/api";
import type { PanelScope } from "@/lib/management";

export type ScheduleValues = { weekday: number; startsAt: string; endsAt: string; validFrom: string | null; validUntil: string | null };
export type EmployeePeriod = ScheduleValues & { id: string };
export type EmployeeScheduleBranch = { id: string; name: string; active: boolean; assigned: boolean };
export type EmployeeSchedulePage = {
  employee: { id: string; name: string; active: boolean };
  branch?: { id: string; name: string; active: boolean };
  timezone: string;
  assigned: boolean;
  branches: EmployeeScheduleBranch[];
  totalBranches?: number;
  hasMoreBranches?: boolean;
  periods: EmployeePeriod[];
  total: number;
  hasMore: boolean;
};
export type EmployeeScheduleWrite =
  | { action: "createPeriod"; employeeId: string; id: string; period: ScheduleValues }
  | { action: "updatePeriod"; employeeId: string; id: string; expected: ScheduleValues; period: ScheduleValues }
  | { action: "deletePeriod"; employeeId: string; id: string; expected: ScheduleValues }
  | { action: "setBranch"; employeeId: string; targetBranchId: string; assigned: boolean; expectedAssigned: boolean };
export type EmployeeScheduleResult = { saved: true; period?: EmployeePeriod; deletedId?: string; branchId?: string; assigned?: boolean };

function path(scope: PanelScope, employeeId?: string, offset?: number, branchOffset?: number) {
  // Never let a missing branch silently choose another tenant or the default branch.
  if (!scope.businessId || !scope.branchId) throw new ApiError("Önce işletme ve şube seç.", 400);
  const search = new URLSearchParams({ businessId: scope.businessId, branchId: scope.branchId });
  if (employeeId) search.set("employeeId", employeeId);
  if (offset !== undefined) search.set("offset", String(offset));
  if (branchOffset !== undefined) search.set("branchOffset", String(branchOffset));
  return `/api/business-management/employee-schedule?${search}`;
}

export const getEmployeeSchedulePage = (token: string, scope: PanelScope, employeeId: string, offset: number, signal?: AbortSignal, branchOffset = 0) =>
  requestJson<EmployeeSchedulePage>(path(scope, employeeId, offset, branchOffset), { signal }, token);

export async function saveEmployeeSchedule(token: string, scope: PanelScope, values: EmployeeScheduleWrite) {
  const result = await requestJson<EmployeeScheduleResult>(path(scope), { method: "POST", body: JSON.stringify(values) }, token);
  if (result.saved !== true) throw new ApiError("Kaydetme sonucu doğrulanamadı. Listeyi yenileyerek kaydı kontrol et.", 503);
  return result;
}

export function periodSnapshot(period: ScheduleValues): ScheduleValues {
  // Preserve the complete PostgreSQL time, including seconds and microseconds.
  return { weekday: period.weekday, startsAt: period.startsAt, endsAt: period.endsAt, validFrom: period.validFrom, validUntil: period.validUntil };
}

function clockValue(value: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d)(?:\.(\d{1,6}))?)?$/.exec(value);
  if (!match) return null;
  return (Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3] ?? 0)) * 1_000_000 + Number((match[4] ?? "").padEnd(6, "0"));
}

function realDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < "0001-01-01") return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function validateScheduleValues(values: ScheduleValues): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!Number.isInteger(values.weekday) || values.weekday < 0 || values.weekday > 6) errors.weekday = "Haftanın gününü seç.";
  const start = clockValue(values.startsAt); const end = clockValue(values.endsAt);
  if (start === null) errors.startsAt = "Saati SS:DD veya SS:DD:ss[.mikrosaniye] biçiminde gir.";
  if (end === null) errors.endsAt = "Saati SS:DD veya SS:DD:ss[.mikrosaniye] biçiminde gir.";
  else if (start !== null && end <= start) errors.endsAt = "Bitiş başlangıçtan sonra olmalı; geceye taşan vardiyayı iki güne böl.";
  if (values.validFrom !== null && !realDate(values.validFrom)) errors.validFrom = "Gerçek bir tarihi YIL-AY-GÜN biçiminde gir veya boş bırak.";
  if (values.validUntil !== null && !realDate(values.validUntil)) errors.validUntil = "Gerçek bir tarihi YIL-AY-GÜN biçiminde gir veya boş bırak.";
  if (values.validFrom && values.validUntil && !errors.validFrom && !errors.validUntil) {
    if (values.validUntil < values.validFrom) errors.validUntil = "Son tarih ilk tarihten önce olamaz.";
    else if (!errors.weekday) {
      const from = new Date(`${values.validFrom}T00:00:00Z`);
      const until = new Date(`${values.validUntil}T00:00:00Z`);
      const firstDay = (from.getUTCDay() + 6) % 7;
      const distance = (values.weekday - firstDay + 7) % 7;
      if (from.getTime() + distance * 86_400_000 > until.getTime()) errors.validUntil = "Tarih aralığı seçilen haftanın gününü içermeli.";
    }
  }
  return errors;
}

export function employeeScheduleError(error: Error): string {
  if (error instanceof ApiError && (error.status === 501 || error.status === 503)) return "İleri vardiya servisi şu anda kullanılamıyor. Girdiğin bilgiler korunuyor; daha sonra yeniden dene.";
  if (error instanceof ApiError && error.status === 409) return `${error.message} Alanların korunuyor. Listeyi yenileyip güncel kaydı yeniden aç.`;
  return error.message;
}
