import { ApiError, requestJson } from "@/lib/api";
import type { PanelScope } from "@/lib/management";
import type { CampaignList, CampaignMutation, ManagedCampaign } from "../../../lib/campaign-management-contract";
export type { CampaignList, CampaignMutation, ManagedCampaign };
export type CampaignAudience = "all" | "new" | "loyal" | "inactive";
export type CampaignSave = CampaignMutation;
function path(scope: PanelScope, q = "", offset = 0) {
  if (!scope.businessId || !scope.branchId) throw new ApiError("İşletme ve şube seçmelisin.", 422);
  return `/api/business-management/campaign-editor?${new URLSearchParams({ businessId: scope.businessId, branchId: scope.branchId, q, offset: String(offset) })}`;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function checkedCampaign(row: ManagedCampaign, scope: PanelScope): ManagedCampaign {
  const terms = row?.terms;
  const invalidTerms = terms !== null && (!terms || !/^[A-Z0-9_-]{3,30}$/.test(terms.code) || !["percentage", "fixed"].includes(terms.kind) || !Number.isInteger(terms.value) || terms.value < 1 || terms.value > 100_000_000 || (terms.kind === "percentage" && terms.value > 100) || !["all", "new", "loyal", "inactive"].includes(terms.audience) || [terms.startsAt, terms.endsAt].some((date) => date !== null && (typeof date !== "string" || !Number.isFinite(Date.parse(date)))) || (terms.startsAt !== null && terms.endsAt !== null && Date.parse(terms.startsAt) >= Date.parse(terms.endsAt)));
  if (!row || !uuid.test(row.id) || row.businessId !== scope.businessId || typeof row.name !== "string" || row.name.length < 2 || row.name.length > 140 || !["draft", "scheduled", "active", "completed", "cancelled"].includes(row.status) || !Number.isInteger(row.revision) || row.revision < 0 || row.revision > 2_147_483_647 || invalidTerms || ![null, "used", "legacy"].includes(row.lockReason) || row.termsEditable !== (terms !== null && row.lockReason === null)) throw new ApiError("Kampanya verisi doğrulanamadı. Listeyi yenile.", 503);
  return row;
}
export async function getCampaigns(token: string, scope: PanelScope, q = "", offset = 0, signal?: AbortSignal) {
  const data = await requestJson<CampaignList>(path(scope, q, offset), { signal }, token);
  if (!data || data.businessId !== scope.businessId || data.offset !== offset || offset % 25 || !Number.isSafeInteger(data.total) || data.total < 0 || !Array.isArray(data.rows) || data.rows.length !== Math.min(25, Math.max(0, data.total - offset)) || data.hasMore !== (offset + data.rows.length < data.total) || new Set(data.rows.map((row) => row.id)).size !== data.rows.length) throw new ApiError("Kampanya listesi doğrulanamadı. Yeniden dene.", 503);
  data.rows.forEach((row) => checkedCampaign(row, scope)); return data;
}
export async function saveCampaign(token: string, scope: PanelScope, values: CampaignMutation) {
  const row = checkedCampaign(await requestJson<ManagedCampaign>(path(scope), { method: "POST", body: JSON.stringify(values) }, token), scope);
  if (values.id && row.id !== values.id) throw new ApiError("Kaydedilen kampanya doğrulanamadı. Listeyi yenile.", 503);
  return row;
}
/** Exact decimal -> minor units; no binary floating-point rounding or FX. */
export function parseCampaignAmount(value: string): number | null {
  const text = value.trim().replace(",", ".");
  if (!/^(0|[1-9][0-9]{0,6})(\.[0-9]{1,2})?$/.test(text)) return null;
  const [major, fractional = ""] = text.split(".");
  const result = Number(major) * 100 + Number(fractional.padEnd(2, "0"));
  return result > 0 && result <= 100_000_000 ? result : null;
}
export function displayCampaignAmount(minor: number): string {
  return `${Math.floor(minor / 100)}${minor % 100 ? `,${String(minor % 100).padStart(2, "0")}` : ""}`;
}
