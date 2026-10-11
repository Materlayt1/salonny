import { requestJson } from "@/lib/api";
import type { PanelScope } from "@/lib/management";
export { waitlistInputToIso, waitlistLocalInput } from "./waitlist-time";

export type WaitlistStatus = "waiting" | "offered" | "accepted" | "expired" | "cancelled";
export type WaitlistEntry = {
  id: string; customerId: string; customerName: string; customerPhone?: string;
  serviceId: string; serviceName: string; employeeId: string | null; employeeName?: string | null;
  desiredFrom: string; desiredTo: string; priority: number; notes: string; status: WaitlistStatus;
  updatedAt: string; offeredStartsAt: string | null; offerExpiresAt: string | null;
  partySize: number; offerExpired: boolean;
};
export type WaitlistPage = { rows: WaitlistEntry[]; hasMore: boolean; timezone: string };
export type WaitlistWrite =
  | { action: "create"; customerId: string; serviceId: string; employeeId: string | null; desiredFrom: string; desiredTo: string; priority: number; notes: string; idempotencyKey: string }
  | { action: "update"; id: string; employeeId: string | null; desiredFrom: string; desiredTo: string; priority: number; notes: string; expectedUpdatedAt: string; idempotencyKey: string }
  | { action: "prepareOffer"; id: string; employeeId: string; startsAt: string; offerMinutes: number; expectedUpdatedAt: string; idempotencyKey: string }
  | { action: "cancel"; id: string; expectedUpdatedAt: string; idempotencyKey: string };
function path(scope: PanelScope, values: Record<string, string | number> = {}) {
  const search = new URLSearchParams();
  Object.entries({ ...scope, ...values }).forEach(([key, value]) => { if (value !== undefined && value !== "") search.set(key, String(value)); });
  return `/api/business-management/waitlist?${search}`;
}
export const getWaitlistPage = (token: string, scope: PanelScope, q: string, status: WaitlistStatus | "active" | "all", offset: number, signal?: AbortSignal) => requestJson<WaitlistPage>(path(scope, { mode: "entries", q, status, offset }), { signal }, token);
export const getWaitlistEntry = (token: string, scope: PanelScope, entryId: string) => requestJson<{ entry: WaitlistEntry; timezone: string }>(path(scope, { mode: "entry", entryId }), {}, token);
export const getWaitlistOfferSlots = (token: string, scope: PanelScope, entryId: string, employeeId: string, date: string, signal?: AbortSignal) => requestJson<{ slots: string[]; timezone: string }>(path(scope, { mode: "slots", entryId, employeeId, date }), { signal }, token);
export const saveWaitlist = (token: string, scope: PanelScope, values: WaitlistWrite) => requestJson<{ saved: boolean; id: string; status: WaitlistStatus; updatedAt: string; notificationSent: false; appointmentCreated: false }>(path(scope), { method: "POST", body: JSON.stringify(values) }, token);
