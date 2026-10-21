import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { apiRateLimit, readBoundedJson } from "@/lib/api-security";
import { BusinessAccessError, getBusinessRequestContext, requirePanelPermission } from "@/lib/business-request-context";
import { appointmentRows, appointmentsQuery, ownEmployee, readBusinessDashboard, type AppointmentRow } from "@/lib/business-panel-read";
import { customerCareDirectoryQuery, customerCareDirectorySchema } from "@/lib/customer-care-contract";
import { inventoryFieldLimits, panelDirectoryFilter, panelDirectoryPageSize, parsePanelDirectoryQuery, type PanelDirectorySection } from "@salonny/contracts";

const sections = new Set(["context", "dashboard", "appointments", "calendar", "customers", "services", "employees", "reports", "inventory", "campaigns", "operations", "settings"]);
const reply = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
function failed(error: unknown) { return reply({ error: error instanceof BusinessAccessError ? error.message : "İşlem tamamlanamadı. Yeniden dene." }, error instanceof BusinessAccessError ? error.status : 503); }
function one<T>(value: T | T[] | null) { return Array.isArray(value) ? value[0] : value; }
export async function GET(request: Request, { params }: { params: Promise<{ section: string }> }) {
  try {
    const { section } = await params;
    if (!sections.has(section)) return reply({ error: "Bölüm bulunamadı." }, 404);
    const limited = await apiRateLimit(request, "business-panel-read", 120, 60_000); if (limited) return limited;
    const context = await getBusinessRequestContext(request);
    requirePanelPermission(context, section);
    const { supabase: client, business, branch } = context;
    if (section === "context") {
      const memberships = await client.from("business_members").select("businesses(id,name)").eq("user_id", context.user.id).eq("active", true).order("created_at").limit(100);
      if (memberships.error) throw memberships.error;
      const businesses = (memberships.data ?? []).map((row) => one(row.businesses)).filter(Boolean);
      return reply({ business, businesses, branch, branches: context.branches, role: context.role, permissions: context.permissions, customerVisibility: context.customerVisibility, financialVisibility: context.financialVisibility, person: context.user.fullName ?? context.user.email?.split("@")[0] ?? "Hesabım" });
    }
    const search = new URL(request.url).searchParams;
    const offset = Math.floor(Math.min(100_000, Math.max(0, Number(search.get("offset") ?? 0) || 0)));
    const limit = 50;
    const q = (search.get("q") ?? "").slice(0, 80).replace(/[%_*\\]/g, "");
    if (section === "appointments" || section === "calendar" || section === "reports") {
      if (search.has("date") && !/^\d{4}-\d{2}-\d{2}$/.test(search.get("date") ?? "")) throw new BusinessAccessError("Geçersiz tarih.", 422);
      let { query } = await appointmentsQuery(context, search.get("date") ?? undefined);
      const appointmentId = search.get("appointmentId");
      if (appointmentId !== null) {
        if (section !== "appointments" || search.getAll("appointmentId").length !== 1 || !z.uuid().safeParse(appointmentId).success) return reply({ error: "Geçersiz randevu seçimi." }, 422);
        // Existing membership, branch, calendar permission and own-employee
        // restrictions still apply; a deep link is not an authorization grant.
        query = query.eq("id", appointmentId);
      }
      const status = search.get("status");
      if (status !== null && (! ["pending", "confirmed", "completed", "cancelled", "no_show"].includes(status) || search.getAll("status").length !== 1)) throw new BusinessAccessError("Geçersiz randevu durumu.", 422);
      if (status) query = query.eq("status", status);
      if (!/^\d+$/.test(search.get("offset") ?? "0") || Number(search.get("offset") ?? 0) > 100_000 || search.getAll("offset").length > 1 || search.getAll("date").length > 1) throw new BusinessAccessError("Geçersiz randevu sayfası.", 422);
      const result = await query.order("starts_at", { ascending: section === "calendar" }).order("id").range(offset, offset + limit - 1).abortSignal(AbortSignal.any([request.signal, AbortSignal.timeout(10_000)]));
      if (result.error) throw result.error;
      if (!Number.isSafeInteger(result.count) || result.count === null || result.count < 0) throw new BusinessAccessError("Randevu toplamı doğrulanamadı.", 503);
      return reply({ rows: appointmentRows((result.data ?? []) as unknown as AppointmentRow[], context), total: result.count, hasMore: offset + limit < result.count });
    }
    if (section === "dashboard") return reply(await readBusinessDashboard(context));
    if (section === "settings") {
      const result = await client.from("business_settings").select("booking_window_days,minimum_notice_minutes,cancellation_notice_minutes,auto_confirm,allow_waitlist").eq("business_id", business.id).maybeSingle();
      if (result.error) throw result.error;
      return reply({ rows: [], settings: result.data ?? { booking_window_days: 60, minimum_notice_minutes: 120, cancellation_notice_minutes: 1440, auto_confirm: true, allow_waitlist: false } });
    }
    if (section === "operations") {
      const [waitlist, resources] = await Promise.all([
        client.from("waitlist_entries").select("id,status,desired_from,desired_to,party_size,customers(full_name),services(name)").eq("business_id", business.id).eq("branch_id", branch.id).in("status", ["waiting", "offered"]).order("created_at").limit(50),
        client.from("business_resources").select("id,name,kind,capacity,active").eq("business_id", business.id).eq("branch_id", branch.id).order("name").limit(50),
      ]);
      if (waitlist.error || resources.error) throw new Error("Operations query failed");
      return reply({ rows: [...(waitlist.data ?? []).map((row) => ({ id: row.id, title: one(row.customers)?.full_name ?? "Müşteri", subtitle: `Bekleme listesi · ${one(row.services)?.name ?? "Hizmet"}`, status: row.status, startsAt: row.desired_from, endsAt: row.desired_to, kind: "waitlist" })), ...(resources.data ?? []).map((row) => ({ id: row.id, title: row.name, subtitle: `Kaynak · ${row.kind} · Kapasite ${row.capacity}`, active: row.active, kind: "resource" }))], hasMore: false });
    }
    if (section === "customers") {
      const checked = customerCareDirectoryQuery.safeParse(Object.fromEntries(search));
      if (!checked.success || new Set([...search.keys()]).size !== [...search.keys()].length) throw new BusinessAccessError("Müşteri listesinin kapsamını ve sayfasını kontrol et.", 422);
      const selected = checked.data;
      const careLimit = await apiRateLimit(request, "business-customer-directory-read", 60, 60_000, { critical: true });
      if (careLimit) { careLimit.headers.set("Cache-Control", "private, no-store"); return careLimit; }
      if (selected.businessId !== business.id || selected.branchId !== branch.id) throw new BusinessAccessError("Bu müşteri kapsamına erişimin yok.", 403);
      const result = await client.rpc("native_customer_care_directory", { p_business_id: business.id, p_branch_id: branch.id, p_q: selected.q, p_offset: Number(selected.offset) })
        .abortSignal(AbortSignal.any([request.signal, AbortSignal.timeout(10_000)]));
      if (result.error?.code === "42501") throw new BusinessAccessError("Bu müşteri listesine erişimin yok.", 403);
      if (result.error?.code === "22023") throw new BusinessAccessError("Müşteri listesinin sayfasını kontrol et.", 422);
      if (result.error) throw new BusinessAccessError("Müşteri bakım altyapısı henüz kullanılamıyor. Yeniden dene.", 503);
      const parsed = customerCareDirectorySchema.safeParse(result.data);
      if (!parsed.success || parsed.data.scope.businessId !== business.id || parsed.data.scope.branchId !== branch.id || parsed.data.q !== selected.q || parsed.data.offset !== Number(selected.offset)
        || parsed.data.scope.financialVisible !== context.financialVisibility || parsed.data.scope.canWrite !== ["OWNER", "MANAGER"].includes(context.role)
        || (context.role === "EMPLOYEE") !== (parsed.data.scope.employeeId !== null)) throw new BusinessAccessError("Müşteri listesi doğrulanamadı. Yeniden dene.", 503);
      // Private care text, balances and media are fetched only when the user
      // opens that customer's card. Never send them with the generic list.
      return reply({ rows: parsed.data.rows.map((row) => ({ id: row.id, title: row.fullName, full_name: row.fullName, subtitle: row.phone, phone: row.phone, email: row.email ?? "", notes: row.notes ?? "", total_visits: row.totalVisits, created_at: row.createdAt })), total: parsed.data.total, hasMore: parsed.data.hasMore });
    }
    const selections = {
      customers: ["customers", "id,full_name,phone,email,notes,total_visits,created_at"],
      services: ["services", "id,name,description,duration_minutes,price_minor,active"],
      employees: ["employees", "id,display_name,title,bio,active"],
      inventory: ["business_inventory_access", `id,name,sku,stock_quantity,minimum_stock,active${context.financialVisibility ? ",purchase_price_minor,sale_price_minor" : ""}`],
      campaigns: ["campaigns", "id,name,status,created_at,discounts(code,kind,value)"],
    } as const;
    const selection = selections[section as keyof typeof selections];
    const directory = ["services", "employees", "inventory"].includes(section);
    let directoryQuery;
    if (directory) {
      try { directoryQuery = parsePanelDirectoryQuery(search); }
      catch { throw new BusinessAccessError("Liste filtresi veya sayfası geçersiz.", 422); }
    }
    const pageOffset = directoryQuery?.offset ?? offset;
    const pageSize = directory ? panelDirectoryPageSize : limit;
    let query = client.from(selection[0]).select(selection[1], { count: "exact" }).eq("business_id", business.id);
    if (directoryQuery?.q) query = query.or(panelDirectoryFilter(section as PanelDirectorySection, directoryQuery.q));
    else if (!directory && q) query = query.ilike("name", `%${q}%`);
    const result = await query.order("created_at", { ascending: false }).order("id").range(pageOffset, pageOffset + pageSize - 1)
      .abortSignal(AbortSignal.any([request.signal, AbortSignal.timeout(10_000)]));
    if (result.error) throw result.error;
    if (!Array.isArray(result.data) || !Number.isSafeInteger(result.count) || result.count === null || result.count < 0) throw new BusinessAccessError("Liste ve toplam kayıt sayısı doğrulanamadı. Yeniden dene.", 503);
    const rows = (result.data ?? []) as unknown as Record<string, unknown>[];
    if (section === "inventory" && context.financialVisibility && rows.some((row) => !Number.isSafeInteger(row.purchase_price_minor) || !Number.isSafeInteger(row.sale_price_minor))) throw new BusinessAccessError("Stok fiyatları doğrulanamadı. Listeyi yenile.", 503);
    return reply({ rows: rows.map((row) => {
      const visible = { ...row };
      if (section === "inventory" && !context.financialVisibility) {
        delete visible.purchase_price_minor;
        delete visible.sale_price_minor;
      }
      return { ...visible, roleTitle: row.title, title: row.full_name ?? row.display_name ?? row.name, subtitle: section === "customers" ? row.phone : section === "employees" ? row.title : section === "inventory" ? row.sku : section === "services" ? `${row.duration_minutes} dk` : "Kampanya" };
    }), total: result.count, hasMore: pageOffset + pageSize < result.count });
  } catch (error) { return failed(error); }
}

const id = z.string().uuid().optional();
const schemas = {
  appointments: z.object({ id: z.string().uuid(), status: z.enum(["confirmed", "completed", "cancelled", "no_show"]) }).strict(),
  services: z.object({ id, name: z.string().trim().min(2).max(120), description: z.string().trim().max(1000).default(""), durationMinutes: z.number().int().min(5).max(1440), price: z.number().min(0).max(10_000_000), active: z.boolean() }).strict(),
  employees: z.object({ id, displayName: z.string().trim().min(2).max(120), title: z.string().trim().max(120).default(""), bio: z.string().trim().max(1000).default(""), active: z.boolean() }).strict(),
  customers: z.object({ id, fullName: z.string().trim().min(2).max(120), phone: z.string().trim().min(10).max(24), email: z.union([z.email(), z.literal("")]).default(""), notes: z.string().trim().max(2000).default("") }).strict(),
  inventory: z.object({ id, name: z.string().trim().min(2).max(inventoryFieldLimits.name), sku: z.string().trim().min(1).max(inventoryFieldLimits.sku), minimumStock: z.number().int().min(0).max(1_000_000), purchasePrice: z.number().min(0).max(10_000_000), salePrice: z.number().min(0).max(10_000_000), active: z.boolean() }).strict(),
  stock: z.object({ id: z.string().uuid(), quantity: z.number().int().min(-1_000_000).max(1_000_000).refine((n) => n !== 0), note: z.string().trim().max(500).default("") }).strict(),
  campaigns: z.object({ id: z.string().uuid(), status: z.enum(["draft", "active", "cancelled"]) }).strict(),
  settings: z.object({ bookingWindowDays: z.number().int().min(1).max(365), minimumNoticeMinutes: z.number().int().min(0).max(43200), cancellationNoticeMinutes: z.number().int().min(0).max(43200), autoConfirm: z.boolean(), allowWaitlist: z.boolean() }).strict(),
};

export async function POST(request: Request, { params }: { params: Promise<{ section: string }> }) {
  try {
    const { section } = await params;
    const body = await readBoundedJson(request, 8192); if (!body.ok) return body.response;
    const isStock = section === "inventory" && typeof body.value === "object" && body.value !== null && "quantity" in body.value;
    const schema = schemas[(isStock ? "stock" : section) as keyof typeof schemas];
    if (!schema) return reply({ error: "Desteklenmeyen işlem." }, 404);
    const parsed = schema.safeParse(body.value); if (!parsed.success) return reply({ error: "Girdiğin bilgileri kontrol et." }, 422);
    const limited = await apiRateLimit(request, "business-panel-write", 60, 60_000, { critical: true }); if (limited) return limited;
    const context = await getBusinessRequestContext(request); requirePanelPermission(context, section, true);
    const { supabase: client, business, branch } = context;
    const values = parsed.data;
    if (section === "appointments" && "status" in values && "id" in values) {
      let check = client.from("business_calendar_appointments").select("id,status").eq("id", values.id!).eq("business_id", business.id).eq("branch_id", branch.id);
      if (context.role === "EMPLOYEE") check = check.eq("employee_id", await ownEmployee(context));
      const existing = await check.maybeSingle();
      if (existing.error) throw existing.error;
      if (!existing.data) throw new BusinessAccessError("Randevu bulunamadı.", 404);
      const transitions: Record<string, string[]> = { pending: ["confirmed", "cancelled"], confirmed: ["completed", "cancelled", "no_show"] };
      if (existing.data.status !== values.status && !transitions[existing.data.status]?.includes(values.status)) throw new BusinessAccessError("Bu durum değişikliği geçerli değil.", 409);
      const result = await client.rpc("business_update_appointment_status", { p_appointment_id: values.id, p_status: values.status });
      if (result.error?.code === "42501") throw new BusinessAccessError("Bu randevuyu güncelleme yetkin yok.", 403);
      if (result.error?.code === "22023") throw new BusinessAccessError("Randevu durumu değişmiş. Listeyi yenileyip yeniden dene.", 409);
      if (result.error) throw result.error;
    } else if (isStock && "quantity" in values) {
      const existing = await client.from("inventory_products").select("id").eq("id", values.id).eq("business_id", business.id).maybeSingle();
      if (existing.error) throw existing.error;
      if (!existing.data) throw new BusinessAccessError("Ürün bulunamadı.", 404);
      const result = await client.rpc("adjust_inventory_stock", { p_product_id: values.id, p_quantity_delta: values.quantity, p_note: values.note || null });
      if (result.error?.code === "42501") throw new BusinessAccessError("Bu ürünün stok miktarını değiştirme yetkin yok.", 403);
      if (["22023", "23514"].includes(result.error?.code ?? "")) throw new BusinessAccessError("Stok hareketi uygulanamadı. Güncel miktarı yenileyip giriş/çıkış miktarını kontrol et.", 409);
      if (result.error) throw result.error;
    } else if (section === "campaigns" && "status" in values) {
      const existing = await client.from("campaigns").select("id").eq("id", values.id!).eq("business_id", business.id).maybeSingle(); if (!existing.data) throw new BusinessAccessError("Kampanya bulunamadı.", 404);
      const result = await client.rpc("set_business_campaign_status", { p_campaign_id: values.id, p_status: values.status }); if (result.error) throw result.error;
    } else if (section === "settings" && "bookingWindowDays" in values) {
      const result = await client.from("business_settings").upsert({ business_id: business.id, booking_window_days: values.bookingWindowDays, minimum_notice_minutes: values.minimumNoticeMinutes, cancellation_notice_minutes: values.cancellationNoticeMinutes, auto_confirm: values.autoConfirm, allow_waitlist: values.allowWaitlist }, { onConflict: "business_id" }); if (result.error) throw result.error;
    } else {
      let table: string; let payload: Record<string, unknown>;
      if (section === "services" && "durationMinutes" in values) { table = "services"; payload = { name: values.name, description: values.description, duration_minutes: values.durationMinutes, price_minor: Math.round(values.price * 100), currency: "TRY", active: values.active }; }
      else if (section === "employees" && "displayName" in values) { table = "employees"; payload = { display_name: values.displayName, title: values.title, bio: values.bio, active: values.active }; }
      else if (section === "customers" && "fullName" in values) { table = "customers"; payload = { full_name: values.fullName, phone: values.phone, email: values.email || null, notes: values.notes || null }; }
      else if (section === "inventory" && "sku" in values) { table = "inventory_products"; payload = { name: values.name, sku: values.sku, minimum_stock: values.minimumStock, purchase_price_minor: Math.round(values.purchasePrice * 100), sale_price_minor: Math.round(values.salePrice * 100), active: values.active }; }
      else return reply({ error: "Geçersiz işlem." }, 422);
      const entityId = "id" in values ? values.id : undefined;
      const result = entityId ? await client.from(table).update(payload).eq("id", entityId).eq("business_id", business.id).select("id").maybeSingle() : await client.from(table).insert({ ...payload, business_id: business.id, ...(table === "inventory_products" ? { stock_quantity: 0 } : {}) }).select("id").single();
      if (section === "inventory" && result.error?.code === "23505") throw new BusinessAccessError("Bu stok kodu işletmende zaten kullanılıyor. Farklı bir kod gir.", 409);
      if (result.error) throw result.error;
      if (!result.data) throw new BusinessAccessError("Kayıt bulunamadı.", 404);
      if (table === "services") { const linked = await client.from("branch_services").upsert({ branch_id: branch.id, service_id: result.data.id, active: "active" in values ? values.active : true }, { onConflict: "branch_id,service_id" }); if (linked.error) throw linked.error; }
      if (table === "employees" && !entityId) { const linked = await client.from("employee_branches").upsert({ branch_id: branch.id, employee_id: result.data.id }, { onConflict: "employee_id,branch_id" }); if (linked.error) throw linked.error; }
    }
    revalidatePath(`/business/${section}`); revalidatePath("/business/dashboard"); revalidateTag("marketplace", "max");
    return reply({ saved: true });
  } catch (error) { return failed(error); }
}
