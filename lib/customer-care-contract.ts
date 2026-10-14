import { z } from "zod";

const uuid = z.string().uuid().transform((value) => value.toLowerCase());
const timestamp = z.string().datetime({ offset: true });
const nullableText = (max: number) => z.string().max(max).nullable();
export const customerCareTab = z.enum(["appointments", "loyalty", "communications", "media"]);
export const customerCareProfileInput = z.object({
  customerId: uuid, expectedVersion: timestamp.nullable(),
  allergies: z.array(z.string().trim().min(1).max(120)).max(50),
  anamnesis: z.string().trim().max(5000), treatmentNotes: z.string().trim().max(5000),
  consentStatus: z.enum(["missing", "requested", "signed", "revoked"]), consentVersion: z.string().trim().max(80),
}).strict();
export const customerCareQuery = z.object({
  businessId: uuid, branchId: uuid, customerId: uuid,
  tab: customerCareTab.default("appointments"),
  offset: z.string().regex(/^(0|[1-9]\d*)$/).default("0").refine((value) => Number(value) <= 100_000 && Number(value) % 25 === 0),
}).strict();
export const customerCareDirectoryQuery = customerCareQuery.omit({ customerId: true, tab: true }).extend({ q: z.string().trim().max(100).default("") }).strict();
export const customerCareWriteResult = z.object({ saved: z.literal(true), customerId: uuid, updatedAt: timestamp }).strict();
const appointment = z.object({
  type: z.literal("appointment"), id: uuid, startsAt: timestamp, endsAt: timestamp,
  status: z.enum(["pending", "confirmed", "completed", "cancelled", "no_show"]),
  employeeName: z.string().max(160), branchName: z.string().max(160), services: z.array(z.string().max(160)).max(100),
  amountMinor: z.string().regex(/^(0|[1-9]\d{0,29})$/).nullable(), currency: z.string().regex(/^[A-Z]{3}$/).nullable(),
}).strict();
const movement = z.object({
  type: z.literal("loyalty"), id: uuid, occurredAt: timestamp,
  kind: z.enum(["account_opened", "observed_baseline", "balance_change"]),
  delta: z.number().int().min(-2147483647).max(2147483647), balanceBefore: z.number().int().nonnegative(), balanceAfter: z.number().int().nonnegative(),
}).strict();
const communication = z.object({
  type: z.literal("communication"), id: uuid, channel: z.enum(["email", "sms", "push", "in_app", "whatsapp"]),
  status: z.enum(["queued", "processing", "delivered", "retry", "dead_letter", "cancelled"]),
  attempts: z.number().int().nonnegative(), createdAt: timestamp, deliveredAt: timestamp.nullable(),
}).strict();
const media = z.object({
  type: z.literal("media"), id: uuid, kind: z.enum(["before", "after", "document"]),
  storagePath: z.string().max(600), caption: nullableText(300), createdAt: timestamp,
  url: z.string().url().nullable().optional(),
}).strict();
export const customerCareSchema = z.object({
  scope: z.object({ businessId: uuid, branchId: uuid, customerId: uuid, employeeId: uuid.nullable(), financialVisible: z.boolean(), canWrite: z.boolean() }).strict(),
  customer: z.object({ id: uuid, fullName: z.string().max(160), phone: z.string().max(24), email: nullableText(254), notes: nullableText(2000), marketingConsent: z.boolean() }).strict(),
  profile: z.object({
    allergies: z.array(z.string().max(120)).max(50), anamnesis: nullableText(5000), treatmentNotes: nullableText(5000),
    consentStatus: z.enum(["missing", "requested", "signed", "revoked"]), consentAt: timestamp.nullable(), consentVersion: nullableText(80), updatedAt: timestamp.nullable(),
  }).strict(),
  loyalty: z.object({ points: z.number().int().nonnegative(), tier: z.enum(["standard", "silver", "gold", "vip"]), updatedAt: timestamp, recordedSince: timestamp.nullable(), pastMovementsKnown: z.literal(false) }).strict().nullable(),
  page: z.object({ tab: customerCareTab, offset: z.number().int().nonnegative().max(100_000), total: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), hasMore: z.boolean(), rows: z.array(z.discriminatedUnion("type", [appointment, movement, communication, media])).max(25) }).strict(),
}).strict().superRefine((value, ctx) => {
  const error = (message: string) => ctx.addIssue({ code: "custom", message });
  if (value.customer.id !== value.scope.customerId) error("Customer scope mismatch");
  if (value.page.offset % 25 || value.page.rows.length !== Math.min(25, Math.max(0, value.page.total - value.page.offset)) || value.page.hasMore !== (value.page.offset + value.page.rows.length < value.page.total)) error("Page mismatch");
  if (new Set(value.page.rows.map((row) => row.id)).size !== value.page.rows.length) error("Duplicate rows");
  const types = { appointments: "appointment", loyalty: "loyalty", communications: "communication", media: "media" };
  if (value.page.rows.some((row) => row.type !== types[value.page.tab])) error("Tab mismatch");
  if (!value.scope.financialVisible && (value.loyalty !== null || value.page.rows.some((row) => row.type === "loyalty" || (row.type === "appointment" && (row.amountMinor !== null || row.currency !== null))))) error("Financial visibility mismatch");
  for (const row of value.page.rows) {
    if (row.type === "appointment" && (Date.parse(row.endsAt) <= Date.parse(row.startsAt) || (row.amountMinor === null) !== (row.currency === null))) error("Appointment integrity mismatch");
    if (row.type === "loyalty" && row.balanceBefore + row.delta !== row.balanceAfter) error("Loyalty balance mismatch");
    if (row.type === "media" && !validateCareMediaPath(row.storagePath, value.scope.businessId, value.scope.customerId)) error("Media scope mismatch");
  }
});

/** Care paths are opaque filenames below an exact tenant/customer directory. */
export function validateCareMediaPath(path: string, businessId: string, customerId: string) {
  const identifier = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  if (!identifier.test(businessId) || !identifier.test(customerId)) return false;
  return path.startsWith(`${businessId}/${customerId}/`) && path.length <= 600 && /^[A-Za-z0-9][A-Za-z0-9._-]{0,400}$/.test(path.slice(74)) && !path.slice(74).includes("..");
}
export type CustomerCare = z.infer<typeof customerCareSchema>;
export type CustomerCareTab = z.infer<typeof customerCareTab>;
export type CustomerCareWrite = z.infer<typeof customerCareProfileInput>;

export const customerCareDirectorySchema = z.object({
  scope: customerCareSchema.shape.scope.omit({ customerId: true }).strict(),
  q: z.string().max(100), offset: z.number().int().nonnegative().max(100_000), total: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), hasMore: z.boolean(),
  rows: z.array(customerCareSchema.shape.customer.extend({
    totalVisits: z.number().int().nonnegative(), totalSpendMinor: z.string().regex(/^(0|[1-9]\d{0,29})$/).nullable(),
    lastVisitAt: timestamp.nullable(), createdAt: timestamp, profile: customerCareSchema.shape.profile, media: z.array(media).max(25), mediaTotal: z.number().int().nonnegative(),
  }).strict()).max(25),
}).strict().superRefine((value, ctx) => {
  const error = (message: string) => ctx.addIssue({ code: "custom", message });
  if (value.offset % 25 || value.rows.length !== Math.min(25, Math.max(0, value.total - value.offset)) || value.hasMore !== (value.offset + value.rows.length < value.total) || new Set(value.rows.map((row) => row.id)).size !== value.rows.length) error("Directory page mismatch");
  for (const row of value.rows) {
    if (!value.scope.financialVisible && row.totalSpendMinor !== null) error("Directory financial mismatch");
    if (row.media.length !== Math.min(25, row.mediaTotal) || row.media.some((item) => !validateCareMediaPath(item.storagePath, value.scope.businessId, row.id))) error("Directory media mismatch");
  }
});
