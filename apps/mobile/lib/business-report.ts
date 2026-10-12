import type { BusinessReport, ReportDays, ReportDimension, ReportValue } from "../../../lib/business-report-contract";
import { ApiError, requestJson } from "@/lib/api";
import type { PanelScope } from "@/lib/management";

export type { BusinessReport, ReportDays, ReportDimension, ReportValue };
export type ReportFilters = { days: ReportDays; allBranches: boolean; dimension: ReportDimension };

const invalid = () => { throw new ApiError("Rapor sonucu doğrulanamadı. Yeniden yükleyerek tekrar dene.", 503); };
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
const number = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER;
const count = (value: unknown): value is number => number(value) && Number.isInteger(value);
const canonicalMinor = (value: unknown): value is string => typeof value === "string" && /^(0|[1-9]\d{0,29})$/.test(value);
const uuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const date = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const delta = (from: string, to: string) => (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
function values(value: unknown): value is ReportValue[] {
  return Array.isArray(value) && value.length <= 32 && value.every((row) => object(row) && typeof row.currency === "string" && /^[A-Z]{3}$/.test(row.currency) && canonicalMinor(row.minor)) && new Set(value.map((row) => row.currency)).size === value.length;
}
function stats(value: unknown): boolean {
  return object(value) && count(value.total) && count(value.completed) && count(value.cancelled) && count(value.noShow) && number(value.bookedMinutes) && value.completed + value.cancelled + value.noShow <= value.total && values(value.values);
}

/** Validate the transport before rendering amounts or accepting a changed scope. */
export function decodeBusinessReport(payload: unknown, scope: PanelScope, filters: ReportFilters, offset: number): BusinessReport {
  if (!object(payload) || typeof payload.generatedAt !== "string" || !Number.isFinite(Date.parse(payload.generatedAt)) || !object(payload.period) || !object(payload.scope) || !object(payload.summary) || !Array.isArray(payload.daily) || !object(payload.breakdown) || !object(payload.utilization)) invalid();
  const raw = payload as Record<string, unknown> & { period: Record<string, unknown>; scope: Record<string, unknown>; summary: Record<string, unknown>; daily: unknown[]; breakdown: Record<string, unknown>; utilization: Record<string, unknown> };
  const period = raw.period; const reportScope = raw.scope; const breakdown = raw.breakdown; const utilization = raw.utilization;
  if (!date(period.from) || !date(period.toExclusive) || !date(period.previousFrom) || period.days !== filters.days || typeof period.timezone !== "string" || period.timezone.length > 100 || delta(period.from, period.toExclusive) !== filters.days || delta(period.previousFrom, period.from) !== filters.days) invalid();
  try { new Intl.DateTimeFormat("en", { timeZone: period.timezone as string }); } catch { invalid(); }
  if (reportScope.businessId !== scope.businessId || reportScope.allBranches !== filters.allBranches || reportScope.branchId !== (filters.allBranches ? null : scope.branchId) || (reportScope.employeeId !== null && !uuid(reportScope.employeeId))) invalid();
  if (!stats(raw.summary.current) || !stats(raw.summary.previous) || raw.daily.length !== filters.days || raw.daily.some((row, index) => !object(row) || !date(row.date) || delta(period.from as string, row.date) !== index || !stats(row))) invalid();
  if (breakdown.dimension !== filters.dimension || breakdown.offset !== offset || !count(breakdown.total) || typeof breakdown.hasMore !== "boolean" || !Array.isArray(breakdown.rows) || breakdown.rows.length !== Math.min(25, Math.max(0, breakdown.total - offset)) || breakdown.hasMore !== (offset + breakdown.rows.length < breakdown.total)) invalid();
  const rows = breakdown.rows as unknown[];
  if (rows.some((row) => !object(row) || !uuid(row.id) || typeof row.label !== "string" || row.label.length < 1 || row.label.length > 160 || !count(row.total) || !count(row.completed) || !count(row.cancelled) || !count(row.noShow) || !number(row.bookedMinutes) || row.completed + row.cancelled + row.noShow > row.total || (filters.dimension === "service" ? row.values !== null : !values(row.values))) || new Set(rows.map((row) => (row as { id: string }).id)).size !== rows.length) invalid();
  if (!date(utilization.from) || !date(utilization.toExclusive) || utilization.days !== 7 || utilization.basis !== "current_plan" || utilization.historical !== false || delta(period.toExclusive as string, utilization.from) !== 1 || delta(utilization.from, utilization.toExclusive) !== 7 || !number(utilization.availableMinutes) || !number(utilization.busyMinutes) || !number(utilization.outsideCapacityMinutes) || utilization.busyMinutes > utilization.availableMinutes + 0.00001 || (utilization.availableMinutes === 0) !== (utilization.ratio === null) || (utilization.ratio !== null && (!number(utilization.ratio) || utilization.ratio > 1 || Math.abs(utilization.ratio - utilization.busyMinutes / utilization.availableMinutes) > 0.00001))) invalid();
  const report = payload as BusinessReport;
  for (const key of ["total", "completed", "cancelled", "noShow"] as const) {
    const sum = report.daily.reduce((total, row) => total + row[key], 0);
    if (!Number.isSafeInteger(sum) || sum !== report.summary.current[key]) invalid();
  }
  const dailyMinutes = report.daily.reduce((total, row) => total + row.bookedMinutes, 0);
  if (!Number.isFinite(dailyMinutes) || Math.abs(dailyMinutes - report.summary.current.bookedMinutes) > Math.max(0.00001, Math.abs(dailyMinutes) * 0.0000000001)) invalid();
  const amounts = new Map<string, bigint>();
  for (const row of report.daily) for (const value of row.values) amounts.set(value.currency, (amounts.get(value.currency) ?? BigInt(0)) + BigInt(value.minor));
  for (const value of report.summary.current.values) {
    if ((amounts.get(value.currency) ?? BigInt(0)) !== BigInt(value.minor)) invalid();
    amounts.delete(value.currency);
  }
  if ([...amounts.values()].some((value) => value !== BigInt(0))) invalid();
  return report;
}

export async function getBusinessReport(token: string, scope: PanelScope, filters: ReportFilters, offset = 0, signal?: AbortSignal) {
  if (!scope.businessId || !scope.branchId) throw new ApiError("Önce işletme ve şube seç.", 400);
  const params = new URLSearchParams({ businessId: scope.businessId, branchId: scope.branchId, days: String(filters.days), allBranches: String(filters.allBranches), dimension: filters.dimension, offset: String(offset) });
  const result = await requestJson<unknown>(`/api/business-management/report-summary?${params}`, { signal }, token);
  return decodeBusinessReport(result, scope, filters, offset);
}

export function formatReportMoney(minor: string, currency: string): string {
  if (!canonicalMinor(minor) || !/^[A-Z]{3}$/.test(currency)) invalid();
  const amount = BigInt(minor); const major = amount / BigInt(100); const cents = (amount % BigInt(100)).toString().padStart(2, "0");
  return `${major.toLocaleString("tr-TR")},${cents} ${currency}`;
}

export function reportPercentChange(current: number, previous: number): string {
  return previous === 0 ? "Önceki dönem sıfır; yüzde değişim hesaplanamaz." : `${current >= previous ? "+" : ""}${((current - previous) / previous * 100).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}% önceki döneme göre`;
}

export function reportValueChange(current: string, previous: string): string {
  if (!canonicalMinor(current) || !canonicalMinor(previous)) invalid();
  const base = BigInt(previous); if (base === BigInt(0)) return "Önceki dönem sıfır; yüzde değişim hesaplanamaz.";
  const change = (BigInt(current) - base) * BigInt(10_000) / base;
  const absolute = change < BigInt(0) ? -change : change;
  return `${change < BigInt(0) ? "−" : "+"}${(absolute / BigInt(100)).toLocaleString("tr-TR")},${(absolute % BigInt(100)).toString().padStart(2, "0")}% önceki döneme göre`;
}
