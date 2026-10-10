import { requestJson } from "@/lib/api";
import type { PanelScope } from "@/lib/management";

export type BookingChoice = { id: string; title: string; subtitle?: string; durationMinutes?: number; priceMinor?: number; currency?: string };
export type BookingChoices = { rows: BookingChoice[]; hasMore: boolean };
export type StaffAvailability = { slots: string[]; timezone: string; quote: { durationMinutes: number; priceMinor: number; currency: string } };
export type StaffBooking = { customerId: string; serviceId: string; employeeId: string; startsAt: string; idempotencyKey: string };
function path(scope: PanelScope, values: Record<string, string | number | undefined>) {
  const search = new URLSearchParams();
  Object.entries({ ...scope, ...values }).forEach(([key, value]) => { if (value !== undefined && value !== "") search.set(key, String(value)); });
  return `/api/business-management/booking-editor?${search}`;
}
export const getBookingChoices = (token: string, scope: PanelScope, kind: "customers" | "services" | "employees", offset: number, q: string, serviceId?: string, signal?: AbortSignal) => requestJson<BookingChoices>(path(scope, { kind, offset, q, serviceId }), { signal }, token);
export const getStaffAvailability = (token: string, scope: PanelScope, serviceId: string, employeeId: string, date: string, signal?: AbortSignal) => requestJson<StaffAvailability>(path(scope, { kind: "slots", serviceId, employeeId, date }), { signal }, token);
export const createStaffBooking = (token: string, scope: PanelScope, values: StaffBooking) => requestJson<{ saved: boolean; id: string }>(path(scope, {}), { method: "POST", body: JSON.stringify(values) }, token);
