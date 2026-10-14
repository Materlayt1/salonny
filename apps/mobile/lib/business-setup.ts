import { setupState, setupInput, setupStartResult, setupSavedResult, setupReviewResult, type BusinessSetupState, type BusinessSetupInput } from "../../../lib/business-setup-contract";
import { ApiError, requestJson } from "@/lib/api";
export type { BusinessSetupState, BusinessSetupInput };
export type SetupScope = { businessId?: string; branchId?: string };
function path(scope: SetupScope, imageOffset = 0) {
  return `/api/business-setup?${new URLSearchParams({ ...(scope.businessId ? { businessId: scope.businessId } : {}), ...(scope.branchId ? { branchId: scope.branchId } : {}), imageOffset: String(imageOffset) })}`;
}
export async function getBusinessSetup(token: string, scope: SetupScope, imageOffset: number, signal?: AbortSignal) {
  const raw = await requestJson<unknown>(path(scope, imageOffset), { signal }, token);
  const parsed = setupState.safeParse(raw);
  if (!parsed.success || scope.businessId && (parsed.data.business?.id !== scope.businessId.toLowerCase() || parsed.data.business?.branchId !== scope.branchId?.toLowerCase()) || parsed.success && parsed.data.imageOffset !== imageOffset) throw new ApiError("Kurulum verisi doğrulanamadı. Yeniden yükle.", 503);
  return parsed.data;
}
export async function saveBusinessSetup(token: string, scope: SetupScope, values: BusinessSetupInput) {
  const parsed = setupInput.safeParse(values);
  if (!parsed.success) throw new ApiError("İşletme, kategori, iletişim ve konum bilgilerini kontrol et.", 422);
  const raw = await requestJson<unknown>(path(scope), { method: "POST", body: JSON.stringify(parsed.data) }, token);
  const decoded = (values.action === "start" ? setupStartResult : values.action === "submit" ? setupReviewResult : setupSavedResult).safeParse(raw);
  if (!decoded.success) throw new ApiError("Kurulum işlem sonucu doğrulanamadı. Aynı seçimi koruyup yeniden dene.", 503);
  return decoded.data as { saved?: true; businessId?: string; branchId?: string; submitted?: boolean; status?: string; missing?: string[] };
}
