import { requestJson } from "@/lib/api";
import type { PanelScope } from "@/lib/management";

export type BusinessResource = { id: string; name: string; kind: "room" | "chair" | "device" | "other"; capacity: number; active: boolean };
export type ResourceService = { id: string; name: string; assigned: boolean; quantity: number; active: boolean };
export type ResourceUsage = { id: string; appointmentId: string; startsAt: string; endsAt: string };
export type ResourceSummary = { peakUnits: number; reservationCount: number; appointmentCount: number };
export type ResourcePage<T> = { rows: T[]; hasMore: boolean; summary?: ResourceSummary; timezone?: string };
export type ResourceWrite =
  | { action: "create"; id: string; name: string; kind: BusinessResource["kind"]; capacity: number; active: boolean; serviceIds?: string[] }
  | { action: "update"; id: string; name: string; capacity: number; active: boolean }
  | { action: "link"; id: string; serviceId: string; assigned: boolean; quantity: number };

function path(scope: PanelScope, params: Record<string, string | number> = {}) {
  const search = new URLSearchParams();
  Object.entries({ ...scope, ...params }).forEach(([key, value]) => { if (value !== undefined && value !== "") search.set(key, String(value)); });
  return `/api/business-management/resources?${search}`;
}
export const getResourcePage = <T,>(token: string, scope: PanelScope, mode: "resources" | "services" | "usage", params: Record<string, string | number>, signal?: AbortSignal) => requestJson<ResourcePage<T>>(path(scope, { mode, ...params }), { signal }, token);
export const saveResource = (token: string, scope: PanelScope, values: ResourceWrite) => requestJson<{ saved: boolean; id: string }>(path(scope), { method: "POST", body: JSON.stringify(values) }, token);
