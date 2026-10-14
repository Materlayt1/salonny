import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { apiRateLimit, readBoundedJson } from "@/lib/api-security";
import { BusinessAccessError, getBusinessRequestContext, requirePanelPermission } from "@/lib/business-request-context";
import { packageAssignmentResult, packageLedgerSchema } from "@/lib/package-ledger-contract";

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
async function requireLedgerInfrastructure(context: Awaited<ReturnType<typeof getBusinessRequestContext>>) {
  const ready = await context.supabase.rpc("native_package_ledger_ready", { p_business_id: context.business.id });
  if (ready.error) throw new BusinessAccessError("Seans geçmişi altyapısı henüz etkin değil. İşletme yöneticine bildir.", 503);
  if (ready.data !== true) throw new BusinessAccessError("Seans geçmişi için işletme sahibi veya yönetici yetkisi gerekiyor.", 403);
}
function rpcFailure(error: { code?: string; message?: string }) {
  if (error.code === "42501") return new BusinessAccessError("Bu paket işlemi için yetkin yok.", 403);
  if (error.code === "22023") return new BusinessAccessError("Geçersiz paket veya sayfa bilgisi.", 422);
  if (error.code === "P0002") return new BusinessAccessError("Müşteri veya paket seçili işletmede bulunamadı.", 404);
  if (error.code === "23505") return new BusinessAccessError("İşlem kimliği farklı bir paket için kullanılmış. Listeyi yenile.", 409);
  if (["PACKAGE_INACTIVE", "PACKAGE_SERVICE_INACTIVE"].includes(error.message ?? "")) return new BusinessAccessError("Paket veya hizmet artık aktif değil. Listeyi yenile.", 409);
  return new BusinessAccessError("Seans kaydı doğrulanamadı. Yeniden dene.", 503);
}

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const allowed = new Set(["businessId", "branchId", "mode", "offset", "q", "customerPackageId"]);
    if ([...params.keys()].some((key) => !allowed.has(key) || params.getAll(key).length !== 1)) return reply({ error: "Geçersiz paket araması veya sayfa." }, 422);
    const mode = params.get("mode") ?? "templates";
    const offsetText = params.get("offset") ?? "0";
    const offset = Number(offsetText);
    const q = (params.get("q") ?? "").trim();
    if (!["templates", "assignments", "customers", "services", "ledger"].includes(mode) || !/^(0|[1-9]\d*)$/.test(offsetText) || !Number.isInteger(offset) || offset < 0 || offset > 100_000 || offset % 25 !== 0 || q.length > 120 || (mode === "ledger" ? !uuid.safeParse(params.get("customerPackageId")).success || q !== "" : params.has("customerPackageId"))) return reply({ error: "Geçersiz paket araması veya sayfa." }, 422);
    const limited = mode === "ledger" ? await apiRateLimit(request, "business-package-ledger-read", 60, 60_000, { critical: true }) : await apiRateLimit(request, "business-packages-read", 120, 60_000);
    if (limited) { limited.headers.set("Cache-Control", "private, no-store"); return limited; }
    const context = await getBusinessRequestContext(request);
    requirePanelPermission(context, "operations", true);
    if (mode === "ledger") {
      await requireLedgerInfrastructure(context);
      const result = await context.supabase.rpc("native_customer_package_ledger", { p_business_id: context.business.id, p_customer_package_id: params.get("customerPackageId")!, p_offset: offset }).abortSignal(AbortSignal.any([request.signal, AbortSignal.timeout(10_000)]));
      if (result.error) throw rpcFailure(result.error);
      const ledger = packageLedgerSchema.safeParse(result.data);
      if (!ledger.success || ledger.data.grant.id !== params.get("customerPackageId") || ledger.data.offset !== offset) throw new BusinessAccessError("Seans geçmişi doğrulanamadı. Yeniden dene.", 503);
      return reply(ledger.data);
    }
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
    const params = new URL(request.url).searchParams;
    if ([...params.keys()].some((key) => !["businessId", "branchId"].includes(key) || params.getAll(key).length !== 1)) return reply({ error: "Geçersiz işletme veya şube." }, 422);
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
      await requireLedgerInfrastructure(context);
      // The database locks the template, snapshots entitlement and appends its
      // first movement in one transaction. Reusing this UUID is a safe retry.
      const result = await client.rpc("assign_customer_package_atomic", { p_business_id: business.id, p_customer_id: values.customerId, p_package_id: values.packageId, p_id: values.id }).abortSignal(AbortSignal.any([request.signal, AbortSignal.timeout(10_000)]));
      if (result.error) throw rpcFailure(result.error);
      const assigned = packageAssignmentResult.safeParse(result.data);
      if (!assigned.success || assigned.data.id !== values.id) throw new BusinessAccessError("Paket tanımı doğrulanamadı. Listeyi yenile.", 503);
    }
    revalidatePath("/business/operations");
    return reply({ saved: true, id: values.id });
  } catch (error) { return failed(error); }
}
