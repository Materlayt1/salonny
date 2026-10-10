import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { apiRateLimit, readBoundedJson } from "@/lib/api-security";
import { BusinessAccessError, getBusinessRequestContext, requirePanelPermission } from "@/lib/business-request-context";
import type { BusinessContext } from "@/lib/business-context";

const uuid = z.string().uuid();
const input = z.object({ customerId: uuid, serviceId: uuid, employeeId: uuid, startsAt: z.iso.datetime({ offset: true }), idempotencyKey: z.string().min(8).max(160).regex(/^[a-zA-Z0-9_-]+$/) }).strict();
const reply = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
function failed(error: unknown) {
  if (error instanceof BusinessAccessError) return reply({ error: error.message }, error.status);
  const failure = error as { code?: string; message?: string };
  if (failure.code === "42501") return reply({ error: "Bu işletmede randevu oluşturma yetkin yok." }, 403);
  if (failure.code === "28000") return reply({ error: "Oturumun doğrulanamadı. Yeniden giriş yap." }, 401);
  if (failure.code === "22023") return reply({ error: "Müşteri, hizmet ve şube seçimlerini yenileyip tekrar dene." }, 422);
  if (failure.code === "23P01" || failure.message?.includes("resource_not_available")) return reply({ error: "Bu saat veya hizmet kaynağı artık müsait değil. Uygun saatleri yenileyip yeniden seç." }, 409);
  if (failure.code === "23505" || failure.message?.includes("idempotency_key_conflict")) return reply({ error: "Bu işlem anahtarı farklı bir randevu için kullanılmış. Seçimleri kontrol et." }, 409);
  if (failure.code === "PGRST202") return reply({ error: "İşletme adına güvenli randevu oluşturma henüz sunucuda etkinleştirilmemiş." }, 503);
  return reply({ error: "Randevu araçlarına ulaşılamadı. Yeniden dene." }, 503);
}
function requireManager(context: BusinessContext) {
  requirePanelPermission(context, "calendar", true);
  if (context.role !== "OWNER" && context.role !== "MANAGER") throw new BusinessAccessError("Randevu oluşturmak için işletme sahibi veya yönetici yetkisi gerekiyor.", 403);
}
async function scopedService(context: BusinessContext, serviceId: string) {
  const response = await context.supabase.from("services").select("id,name,duration_minutes,price_minor,currency,branch_services!inner(branch_id,active,price_override_minor)").eq("id", serviceId).eq("business_id", context.business.id).eq("active", true).eq("branch_services.branch_id", context.branch.id).eq("branch_services.active", true).maybeSingle();
  if (response.error) throw response.error;
  if (!response.data) throw new BusinessAccessError("Aktif hizmet seçili işletme ve şubede bulunamadı.", 404);
  return response.data;
}
async function scopedEmployee(context: BusinessContext, employeeId: string, serviceId: string) {
  const response = await context.supabase.from("employees").select("id,display_name,employee_branches!inner(branch_id),employee_services!inner(service_id,price_override_minor,duration_override_minutes)").eq("id", employeeId).eq("business_id", context.business.id).eq("active", true).eq("employee_branches.branch_id", context.branch.id).eq("employee_services.service_id", serviceId).maybeSingle();
  if (response.error) throw response.error;
  if (!response.data) throw new BusinessAccessError("Bu hizmeti veren aktif çalışan seçili şubede bulunamadı.", 404);
  return response.data;
}
export async function GET(request: Request) {
  try {
    const search = new URL(request.url).searchParams;
    if (!uuid.safeParse(search.get("businessId")).success || !uuid.safeParse(search.get("branchId")).success) return reply({ error: "Önce işletme ve şube seç." }, 422);
    const kind = search.get("kind"); const offset = Number(search.get("offset") ?? 0); const q = (search.get("q") ?? "").trim();
    if (!["customers", "services", "employees", "slots"].includes(kind ?? "") || !Number.isInteger(offset) || offset < 0 || offset > 100_000 || q.length > 100) return reply({ error: "Geçersiz randevu sorgusu." }, 422);
    const serviceId = uuid.safeParse(search.get("serviceId")); const employeeId = uuid.safeParse(search.get("employeeId")); const date = z.iso.date().safeParse(search.get("date"));
    if ((kind === "employees" || kind === "slots") && !serviceId.success || kind === "slots" && (!employeeId.success || !date.success)) return reply({ error: "Hizmet, çalışan ve tarihi kontrol et." }, 422);
    const limited = await apiRateLimit(request, "business-booking-read", 120, 60_000); if (limited) return limited;
    const context = await getBusinessRequestContext(request); requireManager(context);
    const { supabase: client, business, branch } = context;
    // Escape LIKE metacharacters; user text is never interpolated into OR syntax.
    const term = q.replace(/[\\%_]/g, "\\$&");
    if (kind === "customers") {
      let query = client.from("customers").select("id,full_name,phone", { count: "exact" }).eq("business_id", business.id);
      if (q) query = query.ilike("full_name", `%${term}%`);
      const response = await query.order("full_name").order("id").range(offset, offset + 49); if (response.error) throw response.error;
      return reply({ rows: (response.data ?? []).map((row) => ({ id: row.id, title: row.full_name, subtitle: row.phone ?? "" })), hasMore: offset + 50 < (response.count ?? 0) });
    }
    if (kind === "services") {
      let query = client.from("services").select("id,name,duration_minutes,price_minor,currency,branch_services!inner(branch_id,active,price_override_minor)", { count: "exact" }).eq("business_id", business.id).eq("active", true).eq("branch_services.branch_id", branch.id).eq("branch_services.active", true);
      if (q) query = query.ilike("name", `%${term}%`);
      const response = await query.order("name").order("id").range(offset, offset + 49); if (response.error) throw response.error;
      return reply({ rows: (response.data ?? []).map((row) => ({ id: row.id, title: row.name, durationMinutes: row.duration_minutes, priceMinor: row.branch_services?.[0]?.price_override_minor ?? row.price_minor, currency: row.currency })), hasMore: offset + 50 < (response.count ?? 0) });
    }
    const service = await scopedService(context, serviceId.data!);
    if (kind === "employees") {
      let query = client.from("employees").select("id,display_name,role_title,employee_branches!inner(branch_id),employee_services!inner(service_id)", { count: "exact" }).eq("business_id", business.id).eq("active", true).eq("employee_branches.branch_id", branch.id).eq("employee_services.service_id", service.id);
      if (q) query = query.ilike("display_name", `%${term}%`);
      const response = await query.order("display_name").order("id").range(offset, offset + 49); if (response.error) throw response.error;
      return reply({ rows: (response.data ?? []).map((row) => ({ id: row.id, title: row.display_name, subtitle: row.role_title ?? "" })), hasMore: offset + 50 < (response.count ?? 0) });
    }
    const employee = await scopedEmployee(context, employeeId.data!, service.id);
    const response = await client.rpc("get_booking_slots", { p_business_id: business.id, p_branch_id: branch.id, p_employee_id: employee.id, p_service_id: service.id, p_date: date.data! }); if (response.error) throw response.error;
    // Overlapping dated working periods may produce the same slot more than
    // once; expose one selectable instant rather than duplicate React keys.
    const slots = [...new Set<string>((response.data ?? []).map((row: { starts_at: string }) => row.starts_at))];
    return reply({ slots, timezone: business.timezone, quote: { durationMinutes: employee.employee_services?.[0]?.duration_override_minutes ?? service.duration_minutes, priceMinor: employee.employee_services?.[0]?.price_override_minor ?? service.branch_services?.[0]?.price_override_minor ?? service.price_minor, currency: service.currency } });
  } catch (error) { return failed(error); }
}
export async function POST(request: Request) {
  try {
    const search = new URL(request.url).searchParams;
    if (!uuid.safeParse(search.get("businessId")).success || !uuid.safeParse(search.get("branchId")).success) return reply({ error: "Önce işletme ve şube seç." }, 422);
    const body = await readBoundedJson(request, 4096); if (!body.ok) return body.response;
    const parsed = input.safeParse(body.value); if (!parsed.success) return reply({ error: "Müşteri, hizmet, çalışan ve randevu bilgilerini kontrol et." }, 422);
    const limited = await apiRateLimit(request, "business-booking-write", 30, 60_000, { critical: true }); if (limited) return limited;
    const context = await getBusinessRequestContext(request); requireManager(context);
    const { supabase: client, business, branch } = context; const values = parsed.data;
    // This new RPC verifies permissions, idempotency payload, slot and resource
    // collisions in ONE transaction. Do not pre-check mutable customer/service
    // records here: an already committed retry must recover its original result
    // even if those records were changed after a lost response.
    // Never fall back to the older unsafe series RPC.
    const response = await client.rpc("create_staff_appointment_atomic", { p_business_id: business.id, p_branch_id: branch.id, p_customer_id: values.customerId, p_employee_id: values.employeeId, p_service_id: values.serviceId, p_starts_at: values.startsAt, p_idempotency_key: values.idempotencyKey }); if (response.error) throw response.error;
    if (typeof response.data !== "string" || !uuid.safeParse(response.data).success) throw new Error("Missing appointment result");
    for (const path of ["/business/appointments", "/business/calendar", "/business/dashboard", "/business/operations"]) revalidatePath(path);
    return reply({ saved: true, id: response.data }, 201);
  } catch (error) { return failed(error); }
}
