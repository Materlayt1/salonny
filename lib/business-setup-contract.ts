import { z } from "zod";
const id = z.uuid().transform((value) => value.toLowerCase());
const nullableText = (max: number) => z.string().trim().max(max).nullable();
const phone = z.string().trim().max(30).refine((value) => !value || /^[+\d\s()-]+$/.test(value) && value.replace(/\D/g, "").length >= 10 && value.replace(/\D/g, "").length <= 15);
export const setupProfile = z.object({ name: z.string().trim().min(2).max(120), description: z.string().trim().max(4000), phone, whatsappPhone: phone, email: z.union([z.email().max(254), z.literal("")]), websiteUrl: z.union([z.url({ protocol: /^https?$/ }).max(500), z.literal("")]), categoryId: id.nullable() }).strict();
export const setupLocation = z.object({ id, addressLine: z.string().trim().min(5).max(500), district: z.string().trim().min(2).max(100), city: z.string().trim().min(2).max(100), postalCode: z.string().trim().max(16), latitude: z.number().min(35).max(43), longitude: z.number().min(25).max(46) }).strict();
export const setupInput = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), name: z.string().trim().min(2).max(120), description: z.string().trim().max(4000) }).strict(),
  z.object({ action: z.literal("profile"), profile: setupProfile, expectedRevision: z.iso.datetime({ offset: true }) }).strict(),
  z.object({ action: z.literal("location"), location: setupLocation, expected: setupLocation.nullable() }).strict(),
  z.object({ action: z.literal("image"), id, base64: z.string().min(16).max(2_800_000).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/), altText: z.string().trim().min(2).max(160) }).strict(),
  z.object({ action: z.literal("cover"), id, expectedCoverIds: z.array(id).max(50) }).strict(),
  z.object({ action: z.literal("submit") }).strict(),
]);
export const setupQuery = z.object({ businessId: id.transform((value) => value.toLowerCase()).optional(), branchId: id.transform((value) => value.toLowerCase()).optional(), imageOffset: z.string().regex(/^(0|[1-9]\d*)$/).default("0").refine((value) => Number(value) <= 100_000 && Number(value) % 25 === 0) }).strict().refine((value) => Boolean(value.businessId) === Boolean(value.branchId));
export const setupState = z.object({
  business: z.object({ id, branchId: id, branchName: z.string(), slug: z.string(), role: z.enum(["OWNER", "MANAGER"]), status: z.enum(["draft", "pending_review", "published", "suspended"]), revision: z.iso.datetime({ offset: true }), profile: setupProfile }).strict().nullable(),
  location: setupLocation.nullable(), timezone: z.string(),
  categories: z.array(z.object({ id, name: z.string().min(1).max(160) }).strict()).max(200),
  images: z.array(z.object({ id, url: z.url(), kind: z.enum(["logo", "cover", "gallery"]), altText: z.string(), contentHash: nullableText(64) }).strict()).max(25),
  imageOffset: z.number().int().min(0).max(100_000), totalImages: z.number().int().min(0), hasMoreImages: z.boolean(), coverIds: z.array(id).max(50),
  readiness: z.object({ openDays: z.number().int().min(0).max(7), activeServices: z.number().int().min(0), activeEmployees: z.number().int().min(0), settingsPresent: z.boolean() }).strict(),
}).strict();
export type BusinessSetupState = z.infer<typeof setupState>;
export type BusinessSetupInput = z.infer<typeof setupInput>;
export type SetupLocation = z.infer<typeof setupLocation>;
export const setupStartResult = z.object({ businessId: id, branchId: id }).strict();
export const setupSavedResult = z.object({ saved: z.literal(true) }).strict();
export const setupReviewResult = z.object({ submitted: z.boolean(), status: z.enum(["draft", "pending_review", "published", "suspended"]), missing: z.array(z.string().max(160)).max(20) }).strict();
