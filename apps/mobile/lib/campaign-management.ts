import { requestJson } from "@/lib/api";
import type { PanelScope } from "@/lib/management";

export type CampaignAudience = "all" | "new" | "loyal" | "inactive";
export type EditableCampaign = {
  id: string; name: string; audience: CampaignAudience; status: string;
  discount: { code: string; kind: "percentage" | "fixed"; value: number; startsAt: string | null; endsAt: string | null } | null;
};
export type CampaignEditorData = { createAllowed: boolean; campaign?: EditableCampaign };
export type CampaignSave = { action: "create"; name: string; code: string; kind: "percentage" | "fixed"; value: number; audience: CampaignAudience; startsAt: string | null; endsAt: string | null } | { action: "editMetadata"; id: string; name: string; audience: CampaignAudience };
function path(scope: PanelScope, campaignId?: string) {
  const params = new URLSearchParams();
  if (scope.businessId) params.set("businessId", scope.businessId);
  if (scope.branchId) params.set("branchId", scope.branchId);
  if (campaignId) params.set("campaignId", campaignId);
  return `/api/business-management/campaign-editor?${params}`;
}
export const getCampaignEditor = (token: string, scope: PanelScope, campaignId?: string, signal?: AbortSignal) => requestJson<CampaignEditorData>(path(scope, campaignId), { signal }, token);
export const saveCampaign = (token: string, scope: PanelScope, values: CampaignSave) => requestJson<{ saved: true; id: string }>(path(scope), { method: "POST", body: JSON.stringify(values) }, token);
