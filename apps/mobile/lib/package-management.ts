import { requestJson } from "@/lib/api";
import type { PanelScope } from "@/lib/management";

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
export const savePackage = (token: string, scope: PanelScope, values: PackageWrite) => requestJson<{ saved: boolean; id: string }>(path(scope), { method: "POST", body: JSON.stringify(values) }, token);
