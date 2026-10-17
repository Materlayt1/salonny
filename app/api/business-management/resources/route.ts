import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { apiRateLimit, readBoundedJson } from "@/lib/api-security";
import { BusinessAccessError, getBusinessRequestContext, requirePanelPermission } from "@/lib/business-request-context";

const uuid = z.string().uuid(); const name = z.string().trim().min(2).max(120); const units = z.number().int().min(1).max(100);
const input = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), id: uuid, name, kind: z.enum(["room", "chair", "device", "other"]), capacity: units, active: z.boolean(), serviceIds: z.array(uuid).max(100).optional() }).strict(),
  z.object({ action: z.literal("update"), id: uuid, name, capacity: units, active: z.boolean() }).strict(),
  z.object({ action: z.literal("link"), id: uuid, serviceId: uuid, assigned: z.boolean(), quantity: units }).strict(),
]);
const reply = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
const failed = (error: unknown) => reply({ error: error instanceof BusinessAccessError ? error.message : "Kaynak işlemi tamamlanamadı. Yeniden dene." }, error instanceof BusinessAccessError ? error.status : 503);
const relation = <T,>(value: T | T[] | null) => Array.isArray(value) ? value[0] ?? null : value;
const hasExplicitScope = (request: Request) => { const params = new URL(request.url).searchParams; return uuid.safeParse(params.get("businessId")).success && uuid.safeParse(params.get("branchId")).success; };
async function requireInfrastructure(context: Awaited<ReturnType<typeof getBusinessRequestContext>>) {
  const ready = await context.supabase.rpc("native_resource_management_ready", { p_business_id: context.business.id });
  if (ready.error) throw new BusinessAccessError("Kaynak altyapısı güncellemesi henüz tamamlanmadı. İşletme yöneticine bildir.", 503);
  if (ready.data !== true) throw new BusinessAccessError("Kaynak yönetimi için işletme sahibi veya yönetici yetkisi gerekiyor.", 403);
}

export async function GET(request: Request) {
  try {
    if (!hasExplicitScope(request)) return reply({ error: "Kaynak işlemi için işletme ve şube seçmelisin." }, 422);
    const params = new URL(request.url).searchParams; const mode = params.get("mode") ?? "resources";
    const q = (params.get("q") ?? "").trim(); const offset = Number(params.get("offset") ?? 0); const resourceId = params.get("resourceId");
    if (!["resources", "services", "usage"].includes(mode) || q.length > 120 || !Number.isInteger(offset) || offset < 0 || offset > 100_000 || (mode !== "resources" && !uuid.safeParse(resourceId).success)) return reply({ error: "Geçersiz kaynak araması veya sayfa." }, 422);
    const limited = await apiRateLimit(request, "business-resources-read", 120, 60_000); if (limited) return limited;
    const context = await getBusinessRequestContext(request); requirePanelPermission(context, "operations", true); await requireInfrastructure(context);
    const { supabase: client, business, branch } = context; const pattern = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
    if (mode === "resources") {
      let query = client.from("business_resources").select("id,name,kind,capacity,active", { count: "exact" }).eq("business_id", business.id).eq("branch_id", branch.id);
      if (q) query = query.ilike("name", pattern);
      const result = await query.order("name").order("id").range(offset, offset + 24); if (result.error) throw result.error;
      return reply({ rows: result.data ?? [], hasMore: offset + 25 < (result.count ?? 0) });
    }
    const resource = await client.from("business_resources").select("id").eq("id", resourceId!).eq("business_id", business.id).eq("branch_id", branch.id).maybeSingle();
    if (resource.error) throw resource.error;
    if (!resource.data) throw new BusinessAccessError("Kaynak seçili şubede bulunamadı.", 404);
    if (mode === "services") {
      // Include inactive branch services, allowing a manager to remove a requirement
      // that would otherwise keep that service blocked. Never fetch other branches.
      let query = client.from("branch_services").select("active,services!inner(id,name,active)", { count: "exact" }).eq("branch_id", branch.id).eq("services.business_id", business.id);
      if (q) query = query.ilike("services.name", pattern);
      const result = await query.order("name", { referencedTable: "services" }).order("service_id").range(offset, offset + 24); if (result.error) throw result.error;
      const services = (result.data ?? []).map((row) => ({ branchActive: row.active, service: relation(row.services) })).filter((row) => row.service);
      const ids = services.map((row) => row.service!.id);
      const links = ids.length ? await client.from("service_resources").select("service_id,quantity").eq("business_id", business.id).eq("resource_id", resourceId!).in("service_id", ids) : { data: [], error: null };
      if (links.error) throw links.error;
      const quantities = new Map((links.data ?? []).map((row) => [row.service_id, row.quantity]));
      return reply({ rows: services.map(({ service, branchActive }) => ({ id: service!.id, name: service!.name, active: Boolean(branchActive && service!.active), assigned: quantities.has(service!.id), quantity: quantities.get(service!.id) ?? 1 })), hasMore: offset + 25 < (result.count ?? 0) });
    }
    const from = params.get("from"); const to = params.get("to"); const lower = Date.parse(from ?? ""); const upper = Date.parse(to ?? ""); const now = Date.now();
    if (!z.iso.datetime({ offset: true }).safeParse(from).success || !z.iso.datetime({ offset: true }).safeParse(to).success || upper <= lower || upper - lower > 31 * 86_400_000 || lower < now - 366 * 86_400_000 || upper > now + 366 * 86_400_000) return reply({ error: "Kullanım aralığı en fazla 31 gün olmalı; bir yıl içinde bir aralık seç." }, 422);
    const timezone = branch.timezone ?? business.timezone;
    try { new Intl.DateTimeFormat("tr-TR", { timeZone: timezone }); } catch { throw new BusinessAccessError("Şubenin saat dilimi geçersiz. İşletme yöneticine bildir.", 503); }
    const [summary, holds] = await Promise.all([
      client.rpc("get_resource_usage_summary", { p_business_id: business.id, p_branch_id: branch.id, p_resource_id: resourceId, p_from: from, p_to: to }),
      client.from("appointment_resource_reservations").select("id,appointment_id,starts_at,ends_at", { count: "exact" }).eq("business_id", business.id).eq("branch_id", branch.id).eq("resource_id", resourceId!).is("released_at", null).lt("starts_at", to!).gt("ends_at", from!).order("starts_at").order("id").range(offset, offset + 24),
    ]);
    if (summary.error || holds.error) throw new Error("Resource usage lookup failed");
    const parsed = z.object({ peakUnits: z.number().int().nonnegative(), reservationCount: z.number().int().nonnegative(), appointmentCount: z.number().int().nonnegative() }).safeParse(summary.data);
    if (!parsed.success) throw new Error("Invalid resource usage summary");
    return reply({ rows: (holds.data ?? []).map((row) => ({ id: row.id, appointmentId: row.appointment_id, startsAt: row.starts_at, endsAt: row.ends_at })), hasMore: offset + 25 < (holds.count ?? 0), summary: parsed.data, timezone });
  } catch (error) { return failed(error); }
}

export async function POST(request: Request) {
  try {
    if (!hasExplicitScope(request)) return reply({ error: "Kaynak işlemi için işletme ve şube seçmelisin." }, 422);
    const body = await readBoundedJson(request, 8192); if (!body.ok) return body.response;
    const parsed = input.safeParse(body.value); if (!parsed.success) return reply({ error: "Kaynak adı, kapasitesi ve hizmet ihtiyacını kontrol et." }, 422);
    const limited = await apiRateLimit(request, "business-resources-write", 40, 60_000, { critical: true }); if (limited) return limited;
    const context = await getBusinessRequestContext(request); requirePanelPermission(context, "operations", true); await requireInfrastructure(context);
    const { action, id, ...values } = parsed.data;
    const result = await context.supabase.rpc("manage_business_resource", { p_business_id: context.business.id, p_branch_id: context.branch.id, p_action: action, p_resource_id: id, p_values: values });
    if (result.error) {
      const message = result.error.message ?? "";
      if (message.includes("resource_has_upcoming_reservations")) throw new BusinessAccessError("Devam eden veya gelecek rezervasyonlar varken kapasite azaltılamaz ve kaynak pasife alınamaz.", 409);
      if (message.includes("resource_capacity_below_requirement")) throw new BusinessAccessError("Kapasite, bağlı hizmetin ihtiyaç duyduğu birim sayısından düşük olamaz.", 409);
      if (result.error.code === "23505") throw new BusinessAccessError("Kaynak adı veya işlem kimliği zaten kullanılıyor. Listeyi yenile.", 409);
      if (result.error.code === "42501") throw new BusinessAccessError("Bu kaynak işlemi için yetkin yok.", 403);
      if (["22023", "22P02", "23514"].includes(result.error.code ?? "")) throw new BusinessAccessError("Kaynak veya hizmet seçili şubede geçerli değil. Aktiflik ve kapasiteyi kontrol et.", 422);
      throw result.error;
    }
    if (result.data !== id) throw new Error("Missing resource RPC result");
    revalidatePath("/business/operations");
    return reply({ saved: true, id });
  } catch (error) { return failed(error); }
}
