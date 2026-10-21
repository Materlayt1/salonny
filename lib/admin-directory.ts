import "server-only";
import { calendarDayBounds } from "@/lib/business-calendar";
import { requireAdminSession } from "@/lib/admin-access";
import { adminCityPattern, adminExactId, adminLogic, adminOrder, makeAdminCursor, readAdminCursor, type AdminQuery } from "@/lib/admin-directory-query";

type AdminClient = Awaited<ReturnType<typeof requireAdminSession>>["client"];
export type AdminRow = {
  id: string; created_at?: string; starts_at?: string; sort_order?: number;
  name?: string; name_tr?: string; slug?: string; full_name?: string | null; phone?: string | null; city?: string | null;
  status?: string; role?: string; deleted_at?: string | null; verified_at?: string | null;
  active?: boolean; icon?: string | null; rating?: number; comment?: string | null; moderation_status?: string;
  total_minor?: number; currency?: string; business_id?: string | null; actor_user_id?: string | null; entity_id?: string | null; entity_type?: string; action?: string;
  business_categories?: { name_tr: string } | Array<{ name_tr: string }> | null;
  business_locations?: Array<{ city: string; district: string }>;
  businesses?: { name: string } | Array<{ name: string }> | null;
  customers?: { full_name: string } | Array<{ full_name: string }> | null;
  [key: string]: unknown;
};
const definitions = {
  businesses: { table: "businesses", fields: "id,name,slug,status,verified_at,phone,created_at,business_categories(name_tr),business_locations(city,district)" },
  users: { table: "users", fields: "id,full_name,phone,city,role,created_at,deleted_at" },
  appointments: { table: "appointments", fields: "id,business_id,starts_at,status,total_minor,currency,businesses(name),customers(full_name)" },
  reviews: { table: "reviews", fields: "id,business_id,rating,comment,moderation_status,created_at,businesses(name)" },
  audit: { table: "audit_logs", fields: "id::text,business_id,actor_user_id,action,entity_type,entity_id,created_at" },
  categories: { table: "business_categories", fields: "id,name_tr,slug,icon,active,sort_order,created_at" },
} as const;
export type AdminDirectoryResult = { rows: AdminRow[]; total: number; next?: string; prev?: string; selected: AdminRow | null; selectionError?: string };

function baseRead(client: AdminClient, query: AdminQuery, count = false) {
  if (query.section === "overview") throw new Error("Geçersiz bölüm.");
  const definition = definitions[query.section];
  const cityJoin = query.section === "businesses" && query.city;
  const selection = count ? `id${cityJoin ? ",business_locations!inner()" : ""}` : cityJoin ? definition.fields.replace("business_locations(", "business_locations!inner(") : definition.fields;
  let read = client.from(definition.table).select(selection, count ? { count: "exact", head: true } : undefined);
  if (query.status) read = read.eq(query.section === "reviews" ? "moderation_status" : "status", query.status);
  if (query.role) read = read.eq("role", query.role);
  if (query.city) read = read.filter(cityJoin ? "business_locations.city" : "city", "imatch", adminCityPattern(query.city));
  if (query.category) read = read.eq("category_id", query.category);
  if (query.verified) read = query.verified === "yes" ? read.not("verified_at", "is", null) : read.is("verified_at", null);
  if (query.section === "users") {
    if (query.account === "deleted") read = read.not("deleted_at", "is", null);
    else if (query.account !== "all") read = read.is("deleted_at", null);
  }
  if (query.active) read = read.eq("active", query.active === "true");
  for (const [input, column] of [["businessId", "business_id"], ["actorId", "actor_user_id"], ["entityId", "entity_id"]] as const) if (query[input]) read = read.eq(column, query[input]!);
  const order = adminOrder(query.section);
  if (query.from) read = read.gte(order.column, calendarDayBounds(query.from, "Europe/Istanbul").start);
  if (query.to) read = read.lt(order.column, calendarDayBounds(query.to, "Europe/Istanbul").end);
  if (query.q && adminExactId(query)) read = read.eq("id", query.q.toLowerCase());
  const logic = adminLogic(query, count ? undefined : readAdminCursor(query));
  if (logic) read = read.or(logic);
  return read;
}

export async function readAdminDirectory(client: AdminClient, query: AdminQuery): Promise<AdminDirectoryResult> {
  if (query.section === "overview") throw new Error("Geçersiz bölüm.");
  const anchor = readAdminCursor(query), order = adminOrder(query.section), size = Number(query.size);
  let rowsRead = baseRead(client, query).order(order.column, { ascending: anchor?.direction === "prev" ? !order.ascending : order.ascending }).order("id", { ascending: anchor?.direction === "prev" ? !order.ascending : order.ascending }).limit(size + 1);
  // A business may have many locations; never send an unbounded embedded array.
  if (query.section === "businesses") rowsRead = rowsRead.limit(3, { referencedTable: "business_locations" });
  const [list, count] = await Promise.all([
    rowsRead.abortSignal(AbortSignal.timeout(10_000)).overrideTypes<AdminRow[], { merge: false }>(),
    baseRead(client, query, true).abortSignal(AbortSignal.timeout(10_000)),
  ]);
  if (list.error || count.error || !Array.isArray(list.data) || !Number.isSafeInteger(count.count) || count.count === null || count.count < 0) throw new Error("Liste veya toplam kayıt sayısı alınamadı. Bu, boş liste değil.");
  const extra = list.data.length > size;
  const rows = list.data.slice(0, size);
  // Validate seek keys even on a single/last page. Audit IDs remain text: no bigint precision loss.
  for (const row of rows) makeAdminCursor(query, row, "next");
  if (anchor?.direction === "prev") rows.reverse();
  const first = rows.at(0), last = rows.at(-1);
  const prev = first && (anchor?.direction === "prev" ? extra : Boolean(anchor)) ? makeAdminCursor(query, first, "prev") : undefined;
  const next = last && (anchor?.direction === "prev" ? true : extra) ? makeAdminCursor(query, last, "next") : undefined;
  let selected: AdminRow | null = null, selectionError: string | undefined;
  if (query.selected) {
    // Selection is independent of list filters; ID never grants authorization.
    const definition = definitions[query.section];
    try {
      let detail = client.from(definition.table).select(String(definition.fields)).eq("id", query.selected);
      if (query.section === "businesses") detail = detail.limit(3, { referencedTable: "business_locations" });
      const result = await detail.abortSignal(AbortSignal.timeout(10_000)).maybeSingle().overrideTypes<AdminRow, { merge: false }>();
      if (result.error) throw result.error;
      selected = result.data;
      if (!selected) selectionError = "Seçili kayıt bulunamadı veya artık erişilebilir değil.";
    } catch { selectionError = "Seçili kayıt alınamadı. Liste korunuyor; yeniden dene."; }
  }
  return { rows, total: count.count, next, prev, selected, selectionError };
}

export async function readAdminOverview(client: AdminClient) {
  const requests = [
    client.from("users").select("id", { count: "exact", head: true }).is("deleted_at", null),
    client.from("businesses").select("id", { count: "exact", head: true }),
    client.from("businesses").select("id", { count: "exact", head: true }).eq("status", "pending_review"),
    client.from("reviews").select("id", { count: "exact", head: true }).in("moderation_status", ["pending", "flagged"]),
  ];
  const results = await Promise.all(requests.map(read => read.abortSignal(AbortSignal.timeout(10_000))));
  if (results.some(result => result.error || result.count === null || !Number.isSafeInteger(result.count) || result.count < 0)) throw new Error("Platform toplamları şu anda alınamadı. Sıfır olarak gösterilmiyor.");
  return results.map(result => result.count!);
}
