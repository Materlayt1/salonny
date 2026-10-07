import { requestJson } from "@/lib/api";
import type { PanelScope } from "@/lib/management";

export type BusinessHour = { weekday: number; opensAt: string | null; closesAt: string | null; closed: boolean };
export type BusinessProfile = {
  profile: { name: string; phone: string; description: string };
  location: { id: string; addressLine: string; district: string; city: string } | null;
  hours: BusinessHour[]; hasAdvancedHours: boolean; timezone: string; branchName: string;
};
export type BusinessProfileWrite =
  | ({ action: "profile" } & BusinessProfile["profile"])
  | { action: "address"; addressLine: string; district: string; city: string }
  | { action: "hours"; hours: BusinessHour[]; confirmClosure: boolean };
function path(scope: PanelScope) {
  const search = new URLSearchParams();
  if (scope.businessId) search.set("businessId", scope.businessId);
  if (scope.branchId) search.set("branchId", scope.branchId);
  return `/api/business-management/business-profile?${search}`;
}
export const getBusinessProfile = (token: string, scope: PanelScope, signal?: AbortSignal) => requestJson<BusinessProfile>(path(scope), { signal }, token);
export const saveBusinessProfile = (token: string, scope: PanelScope, values: BusinessProfileWrite) => requestJson<{ saved: boolean }>(path(scope), { method: "POST", body: JSON.stringify(values) }, token);
