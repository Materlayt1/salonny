import { requestJson, ApiError } from "@/lib/api";
import type { PanelScope } from "@/lib/management";
import { customerCareSchema, customerCareProfileInput, customerCareWriteResult } from "../../../lib/customer-care-contract";
import type { CustomerCareTab, CustomerCareWrite } from "../../../lib/customer-care-contract";
export type { CustomerCare, CustomerCareTab, CustomerCareWrite } from "../../../lib/customer-care-contract";

function path(scope: PanelScope, customerId: string, tab: CustomerCareTab = "appointments", offset = 0) {
  const params = new URLSearchParams({ businessId: scope.businessId ?? "", branchId: scope.branchId ?? "", customerId, tab, offset: String(offset) });
  return `/api/business-management/customer-care?${params}`;
}
export async function getCustomerCare(token: string, scope: PanelScope, customerId: string, tab: CustomerCareTab, offset: number, signal?: AbortSignal) {
  const parsed = customerCareSchema.safeParse(await requestJson<unknown>(path(scope, customerId, tab, offset), { signal }, token));
  if (!parsed.success) throw new ApiError("Müşteri kaydı doğrulanamadı. Yeniden dene.", 503);
  const value = parsed.data;
  if (value.scope?.businessId !== scope.businessId || value.scope?.branchId !== scope.branchId || value.scope?.customerId !== customerId || value.customer?.id !== customerId || value.page?.tab !== tab || value.page?.offset !== offset
    || !Array.isArray(value.page.rows) || value.page.rows.length > 25 || !Number.isSafeInteger(value.page.total) || value.page.total < 0
    || value.page.rows.length !== Math.min(25, Math.max(0, value.page.total - offset)) || value.page.hasMore !== (offset + value.page.rows.length < value.page.total))
    throw new ApiError("Müşteri kapsamı doğrulanamadı. Yeniden dene.", 503);
  return value;
}
export async function saveCustomerCare(token: string, scope: PanelScope, input: CustomerCareWrite) {
  const checked = customerCareProfileInput.safeParse(input);
  if (!checked.success) throw new ApiError("Bakım alanlarını kontrol et.", 422);
  const parsed = customerCareWriteResult.safeParse(await requestJson<unknown>(path(scope, checked.data.customerId), { method: "POST", body: JSON.stringify(checked.data) }, token));
  if (!parsed.success || parsed.data.customerId !== checked.data.customerId) throw new ApiError("Kayıt sonucu doğrulanamadı. Güncel kaydı yükle.", 503);
  return parsed.data;
}
