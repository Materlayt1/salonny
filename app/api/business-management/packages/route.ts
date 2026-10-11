import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { apiRateLimit, readBoundedJson } from "@/lib/api-security";
import { BusinessAccessError, getBusinessRequestContext, requirePanelPermission } from "@/lib/business-request-context";

const uuid = z.string().uuid();
const name = z.string().trim().min(2).max(120);
const validityDays = z.number().int().min(1).max(3650);
const input = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), id: uuid, name, sessionCount: z.number().int().min(1).max(1000), validityDays, serviceId: uuid.nullable(), active: z.boolean() }).strict(),
  // Never change the service or initial quantity on an existing template:
  // appointment automation matches its current service, and old grants have no snapshot.
  z.object({ action: z.literal("update"), id: uuid, name, validityDays, active: z.boolean() }).strict(),
  z.object({ action: z.literal("assign"), id: uuid, packageId: uuid, customerId: uuid }).strict(),
]);
const reply = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
const failed = (error: unknown) => reply({ error: error instanceof BusinessAccessError ? error.message : "Paket işlemi tamamlanamadı. Yeniden dene." }, error instanceof BusinessAccessError ? error.status : 503);
const relation = <T,>(value: T | T[] | null) => Array.isArray(value) ? value[0] ?? null : value;
async function requirePackageInfrastructure(context: Awaited<ReturnType<typeof getBusinessRequestContext>>) {
  const ready = await context.supabase.rpc("native_package_management_ready", { p_business_id: context.business.id });
  if (ready.error) throw new BusinessAccessError("Paket altyapısı güncellemesi henüz tamamlanmadı. İşletme yöneticine bildir.", 503);
  if (ready.data !== true) throw new BusinessAccessError("Paket yönetimi için işletme sahibi veya yönetici yetkisi gerekiyor.", 403);
}

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const mode = params.get("mode") ?? "templates";
    const offset = Number(params.get("offset") ?? 0);
    const q = (params.get("q") ?? "").trim();
    if (!["templates", "assignments", "customers", "services"].includes(mode) || !Number.isInteger(offset) || offset < 0 || offset > 100_000 || q.length > 120) return reply({ error: "Geçersiz paket araması veya sayfa." }, 422);
    const limited = await apiRateLimit(request, "business-packages-read", 120, 60_000); if (limited) return limited;
    const context = await getBusinessRequestContext(request);
    requirePanelPermission(context, "operations", true);
    await requirePackageInfrastructure(context);
    const { supabase: client, business } = context;
    // Names only: escaped LIKE metacharacters cannot broaden a customer search.
    const pattern = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
    if (mode === "customers" || mode === "services") {
      const table = mode === "customers" ? "customers" : "services";
      const field = mode === "customers" ? "full_name" : "name";
      let query = client.from(table).select(mode === "customers" ? "id,full_name" : "id,name", { count: "exact" }).eq("business_id", business.id);
      if (mode === "services") query = query.eq("active", true);
      if (q) query = query.ilike(field, pattern);
      const result = await query.order(field).order("id").range(offset, offset + 24);
      if (result.error) throw result.error;
      return reply({ rows: (result.data ?? []).map((row) => ({ id: row.id, name: "full_name" in row ? row.full_name : row.name })), hasMore: offset + 25 < (result.count ?? 0) });
    }
    if (mode === "templates") {
      let query = client.from("service_packages").select("id,name,service_id,session_count,validity_days,active,services(name)", { count: "exact" }).eq("business_id", business.id);
      if (q) query = query.ilike("name", pattern);
      const result = await query.order("created_at", { ascending: false }).order("id").range(offset, offset + 24);
      if (result.error) throw result.error;
      return reply({ rows: (result.data ?? []).map((row) => ({ id: row.id, name: row.name, serviceId: row.service_id, serviceName: relation(row.services)?.name ?? null, sessionCount: row.session_count, validityDays: row.validity_days, active: row.active })), hasMore: offset + 25 < (result.count ?? 0) });
    }
    let query = client.from("customer_packages").select("id,remaining_sessions,expires_at,created_at,customers!inner(id,full_name),service_packages!inner(id,name,service_id)", { count: "exact" }).eq("business_id", business.id).eq("customers.business_id", business.id).eq("service_packages.business_id", business.id);
    if (q) query = query.ilike("customers.full_name", pattern);
    const result = await query.order("created_at", { ascending: false }).order("id").range(offset, offset + 24);
    if (result.error) throw result.error;
    return reply({ rows: (result.data ?? []).map((row) => ({ id: row.id, customerId: relation(row.customers)?.id, customerName: relation(row.customers)?.full_name ?? "Müşteri", packageId: relation(row.service_packages)?.id, packageName: relation(row.service_packages)?.name ?? "Paket", remainingSessions: row.remaining_sessions, expiresAt: row.expires_at, expired: Date.parse(row.expires_at) <= Date.now(), usedSessions: null })), hasMore: offset + 25 < (result.count ?? 0), usageNote: "Kalan seans kayıtlı bakiyedir. Eski paketlerde başlangıç bakiyesi saklanmadığı için kullanılan seans sayısı tahmin edilmez." });
  } catch (error) { return failed(error); }
}

export async function POST(request: Request) {
  try {
    const body = await readBoundedJson(request, 4096); if (!body.ok) return body.response;
    const parsed = input.safeParse(body.value); if (!parsed.success) return reply({ error: "Paket adı, seans ve geçerlilik bilgilerini kontrol et." }, 422);
    const limited = await apiRateLimit(request, "business-packages-write", 40, 60_000, { critical: true }); if (limited) return limited;
    const context = await getBusinessRequestContext(request);
    requirePanelPermission(context, "operations", true);
    await requirePackageInfrastructure(context);
    const { supabase: client, business } = context;
    const values = parsed.data;
    if (values.action === "create") {
      if (values.serviceId) {
        const service = await client.from("services").select("id,active").eq("id", values.serviceId).eq("business_id", business.id).maybeSingle();
        if (service.error) throw service.error;
        if (!service.data) throw new BusinessAccessError("Hizmet seçili işletmede bulunamadı.", 404);
        if (!service.data.active) throw new BusinessAccessError("Pasif hizmet için paket oluşturulamaz.", 409);
      }
      const record = { id: values.id, business_id: business.id, name: values.name, service_id: values.serviceId, session_count: values.sessionCount, validity_days: values.validityDays, active: values.active };
      const result = await client.from("service_packages").insert(record).select("id").single();
      if (result.error?.code === "23505") {
        const existing = await client.from("service_packages").select("id,name,service_id,session_count,validity_days,active").eq("id", values.id).eq("business_id", business.id).maybeSingle();
        if (existing.error) throw existing.error;
        if (!existing.data || existing.data.name !== values.name || existing.data.service_id !== values.serviceId || existing.data.session_count !== values.sessionCount || existing.data.validity_days !== values.validityDays || existing.data.active !== values.active) throw new BusinessAccessError("İşlem kimliği farklı bir paket için kullanılmış. Listeyi yenile.", 409);
      } else if (result.error) throw result.error;
      else if (!result.data) throw new Error("Missing package insert result");
    } else if (values.action === "update") {
      const result = await client.from("service_packages").update({ name: values.name, validity_days: values.validityDays, active: values.active }).eq("id", values.id).eq("business_id", business.id).select("id").maybeSingle();
      if (result.error) throw result.error;
      if (!result.data) throw new BusinessAccessError("Paket seçili işletmede bulunamadı.", 404);
    } else {
      // Retries with the same UUID never create a second grant, even if a response was lost.
      const previous = await client.from("customer_packages").select("id,customer_id,package_id").eq("id", values.id).eq("business_id", business.id).maybeSingle();
      if (previous.error) throw previous.error;
      if (previous.data) {
        if (previous.data.customer_id !== values.customerId || previous.data.package_id !== values.packageId) throw new BusinessAccessError("İşlem kimliği farklı bir tanımda kullanılmış. Listeyi yenile.", 409);
        return reply({ saved: true, id: values.id });
      }
      const [customer, pkg] = await Promise.all([
        client.from("customers").select("id").eq("id", values.customerId).eq("business_id", business.id).maybeSingle(),
        client.from("service_packages").select("id,session_count,validity_days,active,service_id").eq("id", values.packageId).eq("business_id", business.id).maybeSingle(),
      ]);
      if (customer.error || pkg.error) throw new Error("Package ownership query failed");
      if (!customer.data || !pkg.data) throw new BusinessAccessError("Müşteri veya paket seçili işletmede bulunamadı.", 404);
      if (!pkg.data.active) throw new BusinessAccessError("Pasif paket müşteriye tanımlanamaz.", 409);
      if (pkg.data.service_id) {
        const service = await client.from("services").select("id,active").eq("id", pkg.data.service_id).eq("business_id", business.id).maybeSingle();
        if (service.error) throw service.error;
        if (!service.data?.active) throw new BusinessAccessError("Paketin hizmeti artık aktif değil.", 409);
      }
      const result = await client.from("customer_packages").insert({ id: values.id, business_id: business.id, customer_id: values.customerId, package_id: values.packageId, remaining_sessions: pkg.data.session_count, expires_at: new Date(Date.now() + pkg.data.validity_days * 86_400_000).toISOString() }).select("id").single();
      if (result.error?.code === "23505") {
        const existing = await client.from("customer_packages").select("id,customer_id,package_id").eq("id", values.id).eq("business_id", business.id).maybeSingle();
        if (existing.error) throw existing.error;
        if (!existing.data || existing.data.customer_id !== values.customerId || existing.data.package_id !== values.packageId) throw new BusinessAccessError("Paket tanımı doğrulanamadı. Listeyi yenile.", 409);
      } else if (result.error) throw result.error;
      else if (!result.data) throw new Error("Missing grant insert result");
    }
    revalidatePath("/business/operations");
    return reply({ saved: true, id: values.id });
  } catch (error) { return failed(error); }
}
