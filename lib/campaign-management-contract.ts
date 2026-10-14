import { z } from "zod";

const uuid = z.string().uuid();
const timestamp = z.iso.datetime({ offset: true }).nullable();
export const campaignTermsSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,30}$/),
  kind: z.enum(["percentage", "fixed"]),
  value: z.number().int().min(1).max(100_000_000),
  audience: z.enum(["all", "new", "loyal", "inactive"]),
  startsAt: timestamp, endsAt: timestamp,
}).strict().superRefine((value, ctx) => {
  if (value.kind === "percentage" && value.value > 100) ctx.addIssue({ code: "custom", message: "Yüzde 1–100 arasında olmalı.", path: ["value"] });
  if (value.startsAt && value.endsAt && Date.parse(value.startsAt) >= Date.parse(value.endsAt)) ctx.addIssue({ code: "custom", message: "Bitiş başlangıçtan sonra olmalı.", path: ["endsAt"] });
});
export const managedCampaignSchema = z.object({
  id: uuid, businessId: uuid, name: z.string().min(2).max(140),
  status: z.enum(["draft", "scheduled", "active", "completed", "cancelled"]),
  revision: z.number().int().min(0).max(2_147_483_647),
  terms: campaignTermsSchema.nullable(), termsEditable: z.boolean(),
  lockReason: z.enum(["used", "legacy"]).nullable(),
}).strict().superRefine((value, ctx) => {
  if (value.termsEditable !== (value.terms !== null && value.lockReason === null)) ctx.addIssue({ code: "custom", message: "Tutarsız kampanya düzenleme yetkisi." });
});
export const campaignListSchema = z.object({ businessId: uuid, offset: z.number().int().min(0).max(1_000_000), total: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER), hasMore: z.boolean(), rows: z.array(managedCampaignSchema).max(25) }).strict().superRefine((value, ctx) => {
  if (value.offset % 25 || value.hasMore !== (value.offset + value.rows.length < value.total) || value.rows.length !== Math.min(25, Math.max(0, value.total - value.offset)) || new Set(value.rows.map((row) => row.id)).size !== value.rows.length || value.rows.some((row) => row.businessId !== value.businessId)) ctx.addIssue({ code: "custom", message: "Tutarsız kampanya sayfası." });
});
const shared = { requestId: uuid, name: z.string().trim().min(2).max(140), status: z.enum(["draft", "active", "cancelled"]) };
export const campaignMutationSchema = z.discriminatedUnion("action", [
  z.object({ ...shared, action: z.literal("save"), id: uuid.nullable(), revision: z.number().int().min(0).max(2_147_483_646).nullable(), terms: campaignTermsSchema }).strict().superRefine((value, ctx) => { if ((value.id === null) !== (value.revision === null)) ctx.addIssue({ code: "custom", message: "Düzenleme sürümü gerekli." }); }),
  z.object({ ...shared, action: z.literal("metadata"), id: uuid, revision: z.number().int().min(0).max(2_147_483_646) }).strict(),
]);
export const campaignQuerySchema = z.object({ businessId: uuid, branchId: uuid, q: z.string().trim().max(120).default(""), offset: z.string().regex(/^(0|[1-9][0-9]*)$/).default("0").refine((value) => Number(value) <= 1_000_000 && Number(value) % 25 === 0) }).strict();
export type ManagedCampaign = z.infer<typeof managedCampaignSchema>;
export type CampaignList = z.infer<typeof campaignListSchema>;
export type CampaignMutation = z.infer<typeof campaignMutationSchema>;
