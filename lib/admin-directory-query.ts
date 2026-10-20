import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { canonicalCity } from "@salonny/contracts/browse-area";

export const adminSections = ["overview", "businesses", "users", "appointments", "reviews", "audit", "categories"] as const;
export type AdminSection = typeof adminSections[number];
export const adminSectionLabels: Record<AdminSection, string> = { overview: "Genel bakış", businesses: "İşletmeler", users: "Kullanıcılar", appointments: "Randevular", reviews: "Yorum moderasyonu", audit: "İşlem geçmişi", categories: "Kategoriler" };
export const adminRoles = { CUSTOMER: "Müşteri", BUSINESS_OWNER: "İşletme sahibi", BUSINESS_MANAGER: "İşletme yöneticisi", EMPLOYEE: "Çalışan", ADMIN: "Platform yöneticisi" };
export const adminBusinessStatuses = { draft: "Taslak", pending_review: "Onay bekliyor", published: "Yayında", suspended: "Askıda" };
export const adminReviewStatuses = { pending: "Bekliyor", flagged: "İşaretli", approved: "Onaylı", rejected: "Reddedildi" };
export const adminAppointmentStatuses = { pending: "Bekliyor", confirmed: "Onaylı", completed: "Tamamlandı", cancelled: "İptal", no_show: "Gelmedi" };
const uuid = z.uuid();
const day = z.iso.date();
const text = z.string().max(80).refine(v => !/[\u0000-\u001f\u007f]/.test(v)).transform(v => v.trim());
const schema = z.object({
  section: z.enum(adminSections).default("overview"), size: z.enum(["25", "50", "100"]).default("50"),
  q: text.default(""), status: z.string().max(30).optional(), role: z.enum(Object.keys(adminRoles) as [keyof typeof adminRoles, ...Array<keyof typeof adminRoles>]).optional(),
  city: z.string().max(50).transform(v => { const city = canonicalCity(v); if (!city) throw new Error("Şehir geçersiz."); return city; }).optional(),
  category: uuid.optional(), verified: z.enum(["yes", "no"]).optional(), account: z.enum(["active", "deleted", "all"]).optional(), active: z.enum(["true", "false"]).optional(),
  from: day.optional(), to: day.optional(), businessId: uuid.optional(), actorId: uuid.optional(), entityId: uuid.optional(),
  selected: uuid.optional(), cursor: z.string().min(1).max(1024).regex(/^[A-Za-z0-9_-]+$/).optional(),
}).strict();
export type AdminQuery = z.infer<typeof schema>;
export type AdminAnchor = { v: 1; fingerprint: string; value: string | number; id: string; direction: "next" | "prev" };
const fields: Record<AdminSection, string[]> = {
  overview: [], businesses: ["q", "status", "city", "category", "verified", "from", "to", "selected"],
  users: ["q", "role", "city", "account", "from", "to", "selected"],
  appointments: ["q", "status", "businessId", "from", "to", "selected"],
  reviews: ["q", "status", "businessId", "from", "to", "selected"],
  audit: ["q", "businessId", "actorId", "entityId", "from", "to"], categories: ["q", "active", "selected"],
};

export function parseAdminQuery(search: URLSearchParams): AdminQuery {
  if (search.size > 20 || new Set(search.keys()).size !== search.size) throw new Error("Tekrarlanan filtre parametresi.");
  const values = Object.fromEntries([...search].filter(([, value]) => value !== ""));
  // Even empty unknown keys must be rejected, not silently ignored.
  if ([...search.keys()].some(key => !Object.hasOwn(schema.shape, key))) throw new Error("Geçersiz filtre.");
  const query = schema.parse(values);
  for (const key of Object.keys(values)) if (!["section", "size", "cursor"].includes(key) && !fields[query.section].includes(key)) throw new Error("Bu bölümde desteklenmeyen filtre.");
  if (query.section === "overview" && query.cursor) throw new Error("Geçersiz sayfa.");
  const statuses = query.section === "businesses" ? adminBusinessStatuses : query.section === "reviews" ? adminReviewStatuses : adminAppointmentStatuses;
  if (query.status && !Object.hasOwn(statuses, query.status)) throw new Error("Geçersiz durum.");
  if (query.from && query.to && query.from > query.to) throw new Error("Tarih aralığı geçersiz.");
  if (query.section === "appointments" && query.q && !uuid.safeParse(query.q).success) throw new Error("Randevu aramasına tam randevu kimliği gir.");
  if (query.cursor) readAdminCursor(query);
  return query;
}

export function adminHref(query: Partial<AdminQuery>, changes: Partial<AdminQuery> = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...query, ...changes })) if (value !== undefined && value !== "") params.set(key, String(value));
  return `/admin${params.size ? `?${params}` : ""}`;
}
function fingerprint(query: AdminQuery) {
  return createHash("sha256").update(JSON.stringify(Object.entries(query).filter(([key]) => !["cursor", "selected"].includes(key)).sort(([a], [b]) => a.localeCompare(b)))).digest("hex").slice(0, 24);
}
export function adminOrder(section: AdminSection) {
  return { column: section === "appointments" ? "starts_at" : section === "categories" ? "sort_order" : "created_at", ascending: section === "categories" };
}
export function adminExactId(query: AdminQuery) {
  return query.section === "audit" ? /^[1-9]\d{0,18}$/.test(query.q) && BigInt(query.q) <= 9223372036854775807n : z.uuid().safeParse(query.q).success;
}
export function adminCityPattern(city: string) {
  const letters: Record<string, string> = { i: "[iıİI]", ı: "[iıİI]", ş: "[şsŞS]", ç: "[çcÇC]", ğ: "[ğgĞG]", ö: "[öoÖO]", ü: "[üuÜU]" };
  return "^\\s*" + [...city.toLocaleLowerCase("tr-TR")].map(c => letters[c] ?? c).join("") + "\\s*$";
}
export function makeAdminCursor(query: AdminQuery, row: { id: string; [key: string]: unknown }, direction: AdminAnchor["direction"]) {
  const value = row[adminOrder(query.section).column];
  const cursor = Buffer.from(JSON.stringify({ v: 1, fingerprint: fingerprint(query), value, id: row.id, direction })).toString("base64url");
  readAdminCursor({ ...query, cursor });
  return cursor;
}
export function readAdminCursor(query: AdminQuery): AdminAnchor | undefined {
  if (!query.cursor) return undefined;
  const anchor = z.object({ v: z.literal(1), fingerprint: z.string().length(24), value: z.union([z.string(), z.number()]), id: z.string(), direction: z.enum(["next", "prev"]) }).strict().parse(JSON.parse(Buffer.from(query.cursor, "base64url").toString("utf8")));
  if (anchor.fingerprint !== fingerprint(query)) throw new Error("Filtre değişti. İlk sayfadan başla.");
  if (query.section === "categories") z.number().int().min(0).max(10000).parse(anchor.value);
  else z.iso.datetime({ offset: true }).parse(anchor.value);
  if (query.section === "audit") z.string().regex(/^[1-9]\d{0,18}$/).refine(v => BigInt(v) <= 9223372036854775807n).parse(anchor.id);
  else uuid.parse(anchor.id);
  return anchor;
}
function quotedRegex(value: string) {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return `"${escaped.replace(/["\\]/g, "\\$&")}"`;
}
/** One logic tree keeps search OR and keyset OR conjunctive. No duplicate `or` keys. */
export function adminLogic(query: AdminQuery, anchor?: AdminAnchor) {
  const columns = query.section === "businesses" ? ["name", "slug", "phone"] : query.section === "users" ? ["full_name", "phone"] : query.section === "reviews" ? ["comment"] : query.section === "audit" ? ["action"] : query.section === "categories" ? ["name_tr", "slug"] : [];
  const search = query.q && !adminExactId(query) && columns.length ? columns.map(column => `${column}.imatch.${quotedRegex(query.q)}`).join(",") : "";
  let seek = "";
  if (anchor) {
    const order = adminOrder(query.section);
    const op = (anchor.direction === "next") === order.ascending ? "gt" : "lt";
    const value = typeof anchor.value === "number" ? anchor.value : `"${anchor.value}"`;
    seek = `${order.column}.${op}.${value},and(${order.column}.eq.${value},id.${op}.${anchor.id})`;
  }
  return search && seek ? `and(or(${search}),or(${seek}))` : search || seek;
}
