import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { apiRateLimit, readBoundedJson } from "@/lib/api-security";
import { BusinessAccessError, getBusinessRequestContext, requirePanelPermission } from "@/lib/business-request-context";
import type { BusinessContext } from "@/lib/business-context";

const uuid = z.string().uuid();
const timestamp = z.iso.datetime({ offset: true });
const idempotencyKey = z.string().min(8).max(160).regex(/^[a-zA-Z0-9_-]+$/);
const window = { employeeId: uuid.nullable(), desiredFrom: timestamp, desiredTo: timestamp, priority: z.number().int().min(0).max(1000), notes: z.string().trim().max(1000) };
const input = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), customerId: uuid, serviceId: uuid, ...window, idempotencyKey }).strict(),
  z.object({ action: z.literal("update"), id: uuid, ...window, expectedUpdatedAt: timestamp, idempotencyKey }).strict(),
  z.object({ action: z.literal("prepareOffer"), id: uuid, employeeId: uuid, startsAt: timestamp, offerMinutes: z.number().int().min(5).max(120), expectedUpdatedAt: timestamp, idempotencyKey }).strict(),
  z.object({ action: z.literal("cancel"), id: uuid, expectedUpdatedAt: timestamp, idempotencyKey }).strict(),
]).refine((value) => !("desiredFrom" in value) || Date.parse(value.desiredFrom) < Date.parse(value.desiredTo), { message: "Geçersiz tarih aralığı." });
const saved = z.object({ saved: z.literal(true), id: uuid, status: z.enum(["waiting", "offered", "accepted", "cancelled"]), updatedAt: timestamp, notificationSent: z.literal(false), appointmentCreated: z.literal(false) }).strict();
const states = ["active", "all", "waiting", "offered", "accepted", "expired", "cancelled"];
const selection = "id,customer_id,service_id,employee_id,desired_from,desired_to,priority,status,updated_at,offered_starts_at,offer_expires_at,notes,party_size,customers!inner(id,full_name,phone,business_id),services!inner(id,name,business_id),employees(display_name)";
const reply = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
function failed(error: unknown) {
  if (error instanceof BusinessAccessError) return reply({ error: error.message }, error.status);
  const failure = error as { code?: string; message?: string };
  if (failure.code === "28000") return reply({ error: "Oturumun doğrulanamadı. Yeniden giriş yap." }, 401);
  if (failure.code === "42501") return reply({ error: "Bekleme listesi için işletme sahibi veya yönetici yetkisi gerekiyor." }, 403);
  if (failure.code === "P0002") return reply({ error: "Kayıt seçili işletme ve şubede bulunamadı." }, 404);
  if (failure.code === "40001") return reply({ error: "Kayıt başka bir işlemde değişti. Güncel kaydı yükleyip bilgileri kontrol et." }, 409);
  if (failure.code === "23505") return reply({ error: failure.message?.includes("idempotency") ? "İşlem anahtarı farklı bilgilerle kullanılmış. Listeyi yenile." : "Müşteri bu hizmet için zaten aktif bekleme listesinde." }, 409);
  if (failure.code === "23P01") return reply({ error: "Saat veya kayıt durumu artık uygun değil. Güncel kaydı ve saatleri yükle." }, 409);
  if (failure.code === "0A000") return reply({ error: "Çok kişilik eski kayıtlar bu ekranda düzenlenemez veya teklif hazırlanamaz. İptal edebilirsin." }, 409);
  if (["22023", "22P02", "22007", "22008", "23514"].includes(failure.code ?? "")) return reply({ error: "Müşteri, şube, hizmet, çalışan ve tarih aralığını kontrol et." }, 422);
  return reply({ error: "Güvenli bekleme listesi altyapısına ulaşılamadı. Güncelleme henüz etkinleştirilmemiş olabilir." }, 503);
}
async function manager(request: Request) {
  const context = await getBusinessRequestContext(request);
  requirePanelPermission(context, "operations", true);
  const ready = await context.supabase.rpc("native_waitlist_management_ready", { p_business_id: context.business.id, p_branch_id: context.branch.id });
  if (ready.error) throw ready.error;
  if (ready.data !== true) throw new BusinessAccessError("Bekleme listesi için işletme sahibi veya yönetici yetkisi gerekiyor.", 403);
  return context;
}
function scopeIsValid(request: Request) {
  const params = new URL(request.url).searchParams;
  return uuid.safeParse(params.get("businessId")).success && uuid.safeParse(params.get("branchId")).success;
}
const one = <T,>(value: T | T[] | null) => Array.isArray(value) ? value[0] ?? null : value;
type WaitlistRecord = {
  id: string; customer_id: string; service_id: string; employee_id: string | null;
  desired_from: string; desired_to: string; priority: number; status: string; updated_at: string;
  offered_starts_at: string | null; offer_expires_at: string | null; notes: string | null; party_size: number;
  customers: { full_name: string; phone: string | null } | { full_name: string; phone: string | null }[];
  services: { name: string } | { name: string }[]; employees: { display_name: string } | { display_name: string }[] | null;
};
function row(value: WaitlistRecord) {
  return { id: value.id, customerId: value.customer_id, customerName: one(value.customers)?.full_name ?? "Müşteri", customerPhone: one(value.customers)?.phone ?? "", serviceId: value.service_id, serviceName: one(value.services)?.name ?? "Hizmet", employeeId: value.employee_id, employeeName: one(value.employees)?.display_name ?? null, desiredFrom: value.desired_from, desiredTo: value.desired_to, priority: value.priority, status: value.status, updatedAt: value.updated_at, offeredStartsAt: value.offered_starts_at, offerExpiresAt: value.offer_expires_at, notes: value.notes ?? "", partySize: value.party_size, offerExpired: value.status === "offered" && Boolean(value.offer_expires_at && Date.parse(value.offer_expires_at) <= Date.now()) };
}
function scopedQuery(context: BusinessContext) {
  return context.supabase.from("waitlist_entries").select(selection, { count: "exact" }).eq("business_id", context.business.id).eq("branch_id", context.branch.id).eq("customers.business_id", context.business.id).eq("services.business_id", context.business.id);
}
export async function GET(request: Request) {
  try {
    if (!scopeIsValid(request)) return reply({ error: "Önce işletme ve şube seç." }, 422);
    const params = new URL(request.url).searchParams;
    const mode = params.get("mode") ?? "entries";
    const status = params.get("status") ?? "active";
    const offset = Number(params.get("offset") ?? 0);
    const q = (params.get("q") ?? "").trim();
    if (!["entries", "entry", "slots"].includes(mode) || !states.includes(status) || !Number.isInteger(offset) || offset < 0 || offset > 100_000 || q.length > 100) return reply({ error: "Geçersiz bekleme listesi araması veya sayfa." }, 422);
    const entryId = uuid.safeParse(params.get("entryId"));
    const employeeId = uuid.safeParse(params.get("employeeId"));
    const date = z.iso.date().safeParse(params.get("date"));
    if (mode !== "entries" && !entryId.success || mode === "slots" && (!employeeId.success || !date.success)) return reply({ error: "Kayıt, çalışan ve tarihi kontrol et." }, 422);
    const limited = await apiRateLimit(request, "business-waitlist-read", 120, 60_000); if (limited) return limited;
    const context = await manager(request);
    try { new Intl.DateTimeFormat("tr-TR", { timeZone: context.business.timezone }); }
    catch { throw new BusinessAccessError("İşletmenin saat dilimi geçersiz. İşletme yöneticine bildir.", 503); }
    if (mode === "entries") {
      let query = scopedQuery(context);
      if (status === "active") query = query.in("status", ["waiting", "offered"]);
      else if (status !== "all") query = query.eq("status", status);
      if (q) query = query.ilike("customers.full_name", `%${q.replace(/[\\%_]/g, "\\$&")}%`);
      const result = await query.order("priority").order("created_at").order("id").range(offset, offset + 24);
      if (result.error) throw result.error;
      return reply({ rows: (result.data ?? []).map((value) => row(value as unknown as WaitlistRecord)), hasMore: offset + 25 < (result.count ?? 0), timezone: context.business.timezone });
    }
    const entry = await scopedQuery(context).eq("id", entryId.data!).maybeSingle();
    if (entry.error) throw entry.error;
    if (!entry.data) throw new BusinessAccessError("Kayıt seçili işletme ve şubede bulunamadı.", 404);
    const current = entry.data as unknown as WaitlistRecord;
    if (mode === "entry") return reply({ entry: row(current), timezone: context.business.timezone });
    if (current.status !== "waiting" || Date.parse(current.desired_to) <= Date.now()) throw new BusinessAccessError("Bu kayıt şu anda teklif hazırlamaya uygun değil. Güncel kaydı yükle.", 409);
    if (current.party_size !== 1) throw new BusinessAccessError("Çok kişilik eski kayıtlar için bu ekranda teklif hazırlanamaz.", 409);
    if (current.employee_id && current.employee_id !== employeeId.data) throw new BusinessAccessError("Önce kaydın çalışan tercihini güncelle.", 422);
    const employee = await context.supabase.from("employees").select("id,employee_branches!inner(branch_id),employee_services!inner(service_id)").eq("id", employeeId.data!).eq("business_id", context.business.id).eq("active", true).eq("employee_branches.branch_id", context.branch.id).eq("employee_services.service_id", current.service_id).maybeSingle();
    if (employee.error) throw employee.error;
    if (!employee.data) throw new BusinessAccessError("Çalışan bu şubede ve hizmette aktif değil.", 422);
    const slots = await context.supabase.rpc("get_booking_slots", { p_business_id: context.business.id, p_branch_id: context.branch.id, p_employee_id: employeeId.data!, p_service_id: current.service_id, p_date: date.data! });
    if (slots.error) throw slots.error;
    const starts = (slots.data ?? []) as { starts_at: string }[];
    return reply({ slots: [...new Set(starts.map((value) => value.starts_at))].filter((value) => Date.parse(value) > Date.now() && Date.parse(value) >= Date.parse(current.desired_from) && Date.parse(value) <= Date.parse(current.desired_to)), timezone: context.business.timezone });
  } catch (error) { return failed(error); }
}
export async function POST(request: Request) {
  try {
    if (!scopeIsValid(request)) return reply({ error: "Önce işletme ve şube seç." }, 422);
    const body = await readBoundedJson(request, 4096); if (!body.ok) return body.response;
    const parsed = input.safeParse(body.value); if (!parsed.success) return reply({ error: "Bekleme listesi bilgilerini ve tarih aralığını kontrol et." }, 422);
    const limited = await apiRateLimit(request, "business-waitlist-write", 30, 60_000, { critical: true }); if (limited) return limited;
    const context = await manager(request);
    const { action, idempotencyKey: key, ...payload } = parsed.data;
    // Mutable status/reference checks live after the replay ledger in ONE RPC.
    // A lost successful response must remain replayable even after a later edit.
    const result = await context.supabase.rpc("manage_native_waitlist", { p_business_id: context.business.id, p_branch_id: context.branch.id, p_action: action, p_payload: action === "create" ? { ...payload, partySize: 1 } : payload, p_idempotency_key: key });
    if (result.error) throw result.error;
    const verified = saved.safeParse(result.data); if (!verified.success) throw new Error("Invalid waitlist write result");
    revalidatePath("/business/operations");
    return reply(verified.data, action === "create" ? 201 : 200);
  } catch (error) { return failed(error); }
}
