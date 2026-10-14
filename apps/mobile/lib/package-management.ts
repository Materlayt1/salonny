import { ApiError, requestJson } from "@/lib/api";
import type { PanelScope } from "@/lib/management";
import type { PackageLedger } from "../../../lib/package-ledger-contract";
export type { PackageLedger };

export type PackageTemplate = { id: string; name: string; serviceId: string | null; serviceName: string | null; sessionCount: number; validityDays: number; active: boolean };
export type PackageGrant = { id: string; customerId: string; customerName: string; packageId: string; packageName: string; remainingSessions: number; expiresAt: string; expired: boolean; usedSessions: null };
export type PackageChoice = { id: string; name: string };
export type PackagePage<T> = { rows: T[]; hasMore: boolean; usageNote?: string };
export type PackageWrite =
  | { action: "create"; id: string; name: string; serviceId: string | null; sessionCount: number; validityDays: number; active: boolean }
  | { action: "update"; id: string; name: string; validityDays: number; active: boolean }
  | { action: "assign"; id: string; packageId: string; customerId: string };
function path(scope: PanelScope, params: Record<string, string | number> = {}) {
  const search = new URLSearchParams();
  Object.entries({ ...scope, ...params }).forEach(([key, value]) => { if (value !== undefined && value !== "") search.set(key, String(value)); });
  return `/api/business-management/packages?${search}`;
}
export const getPackagePage = <T,>(token: string, scope: PanelScope, mode: "templates" | "assignments" | "customers" | "services", q: string, offset: number, signal?: AbortSignal) => requestJson<PackagePage<T>>(path(scope, { mode, q, offset }), { signal }, token);
export async function savePackage(token: string, scope: PanelScope, values: PackageWrite) {
  const result = await requestJson<{ saved: boolean; id: string }>(path(scope), { method: "POST", body: JSON.stringify(values) }, token);
  if (result.saved !== true || result.id !== values.id) throw new ApiError("Paket işleminin yanıtı doğrulanamadı. Listeyi yenile.", 503);
  return result;
}

const invalidLedger = () => { throw new ApiError("Seans geçmişi doğrulanamadı. Yeniden yükleyerek tekrar dene.", 503); };
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
const keys = (value: Record<string, unknown>, expected: string[]) => Object.keys(value).length === expected.length && Object.keys(value).every((key) => expected.includes(key));
const uuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const sessions = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 1_000_000;
const timestamp = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
/** Defensive transport validation also covers intercepted or mismatched native responses. */
export function decodePackageLedger(value: unknown, grantId: string, offset: number): PackageLedger {
  if (!object(value) || !keys(value, ["grant", "offset", "total", "hasMore", "rows"]) || !object(value.grant) || !Array.isArray(value.rows)) invalidLedger();
  const page = value as { grant: Record<string, unknown>; rows: unknown[]; offset: unknown; total: unknown; hasMore: unknown };
  const grant = page.grant;
  if (!keys(grant, ["id", "customerId", "packageId", "packageName", "remainingSessions", "expiresAt", "initialSessions", "validityDays", "origin", "recordedAt", "serviceId", "priceMinor", "currency", "usedSessions", "recordedUsedSessions"]) || grant.id !== grantId || !uuid(grant.customerId) || !uuid(grant.packageId) || typeof grant.packageName !== "string" || !grant.packageName.length || grant.packageName.length > 120 || !sessions(grant.remainingSessions) || !timestamp(grant.expiresAt) || !["grant", "legacy_baseline", "unrecorded"].includes(String(grant.origin)) || (grant.serviceId !== null && !uuid(grant.serviceId)) || grant.priceMinor !== null || grant.currency !== null || !sessions(grant.recordedUsedSessions)) invalidLedger();
  if (grant.origin === "grant") {
    if (!sessions(grant.initialSessions) || grant.initialSessions < 1 || grant.initialSessions > 1000 || typeof grant.validityDays !== "number" || !Number.isInteger(grant.validityDays) || grant.validityDays < 1 || grant.validityDays > 3650 || !timestamp(grant.recordedAt) || grant.usedSessions !== grant.recordedUsedSessions || grant.initialSessions - (grant.remainingSessions as number) !== grant.recordedUsedSessions) invalidLedger();
  } else if (grant.initialSessions !== null || grant.validityDays !== null || grant.usedSessions !== null || (grant.origin === "unrecorded" ? grant.recordedAt !== null : !timestamp(grant.recordedAt))) invalidLedger();
  if (page.offset !== offset || offset < 0 || offset > 100_000 || offset % 25 !== 0 || typeof page.total !== "number" || !Number.isSafeInteger(page.total) || page.total < 0 || typeof page.hasMore !== "boolean" || page.rows.length !== Math.min(25, Math.max(0, page.total - offset)) || page.hasMore !== (offset + page.rows.length < page.total) || (grant.origin === "unrecorded" && (grant.recordedUsedSessions !== 0 || page.total !== 0))) invalidLedger();
  if (page.rows.some((row) => !object(row) || !keys(row, ["id", "kind", "sessionsDelta", "balanceAfter", "appointmentId", "serviceName", "occurredAt"]) || !uuid(row.id) || !["grant", "baseline", "consume"].includes(String(row.kind)) || !sessions(row.balanceAfter) || !timestamp(row.occurredAt) || (row.serviceName !== null && (typeof row.serviceName !== "string" || row.serviceName.length > 160)) || (row.kind === "consume" ? row.sessionsDelta !== -1 || !uuid(row.appointmentId) : row.appointmentId !== null || (row.kind === "baseline" ? row.sessionsDelta !== 0 : !Number.isInteger(row.sessionsDelta) || Number(row.sessionsDelta) < 1 || Number(row.sessionsDelta) > 1000))) || new Set(page.rows.map((row) => (row as { id: string }).id)).size !== page.rows.length) invalidLedger();
  const ledger = value as PackageLedger;
  if (offset === 0 && ledger.rows.length && ledger.rows[0].balanceAfter !== ledger.grant.remainingSessions) invalidLedger();
  for (let index = 0; index < ledger.rows.length - 1; index += 1) if (ledger.rows[index].kind !== "consume" || ledger.rows[index].balanceAfter !== ledger.rows[index + 1].balanceAfter - 1) invalidLedger();
  if (ledger.rows.some((row) => row.kind === "grant" && (ledger.grant.origin !== "grant" || row.balanceAfter !== ledger.grant.initialSessions || row.sessionsDelta !== ledger.grant.initialSessions)) || ledger.rows.some((row) => row.kind === "baseline" && ledger.grant.origin !== "legacy_baseline")) invalidLedger();
  return ledger;
}
export async function getPackageLedger(token: string, scope: PanelScope, grantId: string, offset = 0, signal?: AbortSignal) {
  const result = await requestJson<unknown>(path(scope, { mode: "ledger", customerPackageId: grantId, offset }), { signal }, token);
  return decodePackageLedger(result, grantId, offset);
}
