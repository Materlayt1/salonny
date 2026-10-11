import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { apiRateLimit, readBoundedJson } from "@/lib/api-security";
import { BusinessAccessError, getBusinessRequestContext, requirePanelPermission } from "@/lib/business-request-context";
import type { BusinessContext } from "@/lib/business-context";

const sections = new Set(["context", "dashboard", "appointments", "calendar", "customers", "services", "employees", "reports", "inventory", "campaigns", "operations", "settings"]);
const reply = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
function failed(error: unknown) { return reply({ error: error instanceof BusinessAccessError ? error.message : "İşlem tamamlanamadı. Yeniden dene." }, error instanceof BusinessAccessError ? error.status : 503); }
function one<T>(value: T | T[] | null) { return Array.isArray(value) ? value[0] : value; }
async function ownEmployee(context: BusinessContext) {
  const result = await context.supabase.from("employees").select("id").eq("business_id", context.business.id).eq("user_id", context.user.id).eq("active", true).limit(1).maybeSingle();
  if (result.error) throw new BusinessAccessError("Çalışan bilgisi alınamadı.", 503);
  if (!result.data) throw new BusinessAccessError("Çalışan eşleşmesi bulunamadı.", 403);
  return result.data.id as string;
}
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
async function appointmentsQuery(context: BusinessContext, date?: string) {
  let query = context.supabase.from("appointments").select("id,customer_id,employee_id,starts_at,ends_at,status,total_minor,currency,customers(full_name,phone),employees(display_name),appointment_items(name_snapshot)", { count: "exact" }).eq("business_id", context.business.id).eq("branch_id", context.branch.id);
  if (context.role === "EMPLOYEE") query = query.eq("employee_id", await ownEmployee(context));
  if (date) {
    if (!datePattern.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00+03:00`))) throw new BusinessAccessError("Geçersiz tarih.", 422);
    const start = new Date(`${date}T00:00:00+03:00`);
    if (new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(start) !== date) throw new BusinessAccessError("Geçersiz tarih.", 422);
    query = query.gte("starts_at", start.toISOString()).lt("starts_at", new Date(start.getTime() + 86_400_000).toISOString());
  }
  // Supabase builders are thenable; wrapping avoids executing before pagination.
  return { query };
}
type AppointmentRow = { id: string; customer_id: string; employee_id: string; starts_at: string; ends_at: string; status: string; total_minor: number; currency: string; customers: { full_name: string; phone: string } | { full_name: string; phone: string }[] | null; employees: { display_name: string } | { display_name: string }[] | null; appointment_items: { name_snapshot: string }[] | null };
function appointmentRows(rows: AppointmentRow[], context: BusinessContext) {
  return rows.map((row) => ({ id: row.id, title: context.customerVisibility === "none" ? "Müşteri" : one(row.customers)?.full_name ?? "Müşteri", subtitle: `${row.appointment_items?.[0]?.name_snapshot ?? "Hizmet"} · ${one(row.employees)?.display_name ?? "Çalışan"}`, phone: context.customerVisibility === "none" ? "" : one(row.customers)?.phone ?? "", status: row.status, startsAt: row.starts_at, endsAt: row.ends_at, employeeId: row.employee_id, ...(context.financialVisibility ? { amountMinor: row.total_minor, currency: row.currency } : {}) }));
}

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
      let { query } = await appointmentsQuery(context, search.get("date") ?? undefined);
      const status = search.get("status");
      if (status && ["pending", "confirmed", "completed", "cancelled", "no_show"].includes(status)) query = query.eq("status", status);
      const result = await query.order("starts_at", { ascending: section === "calendar" }).range(offset, offset + limit - 1);
      if (result.error) throw result.error;
      return reply({ rows: appointmentRows((result.data ?? []) as unknown as AppointmentRow[], context), total: result.count ?? 0, hasMore: offset + limit < (result.count ?? 0) });
    }
    if (section === "dashboard") {
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
      const { query: todayQuery } = context.permissions.calendar ? await appointmentsQuery(context, today) : { query: null };
      const [appointments, services, employees, customers] = await Promise.all([
        todayQuery ? todayQuery.order("starts_at").limit(8) : Promise.resolve({ data: [], count: null, error: null }),
        client.from("services").select("id", { count: "exact", head: true }).eq("business_id", business.id).eq("active", true),
        client.from("employees").select("id", { count: "exact", head: true }).eq("business_id", business.id).eq("active", true),
        context.customerVisibility === "all" && context.permissions.customers ? client.from("customers").select("id", { count: "exact", head: true }).eq("business_id", business.id) : Promise.resolve({ count: null, error: null }),
      ]);
      if (appointments.error || services.error || employees.error || customers.error) throw new Error("Dashboard query failed");
      return reply({ rows: appointmentRows((appointments.data ?? []) as unknown as AppointmentRow[], context), total: appointments.count ?? 0, hasMore: false, metrics: [...(appointments.count !== null ? [{ label: "Bugünkü randevular", value: String(appointments.count), icon: "calendar" }] : []), { label: "Aktif hizmetler", value: String(services.count ?? 0), icon: "scissors" }, { label: "Çalışanlar", value: String(employees.count ?? 0), icon: "users" }, ...(customers.count !== null ? [{ label: "Müşteriler", value: String(customers.count), icon: "customer" }] : [])] });
    }
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
    const selections = {
      customers: ["customers", "id,full_name,phone,email,notes,total_visits,created_at"],
      services: ["services", "id,name,description,duration_minutes,price_minor,active"],
      employees: ["employees", "id,display_name,title,bio,active"],
      inventory: ["inventory_products", "id,name,sku,stock_quantity,minimum_stock,purchase_price_minor,sale_price_minor,active"],
      campaigns: ["campaigns", "id,name,status,created_at,discounts(code,kind,value)"],
    } as const;
    const selection = selections[section as keyof typeof selections];
    let query = client.from(selection[0]).select(selection[1], { count: "exact" }).eq("business_id", business.id);
    if (q) query = query.ilike(section === "customers" ? "full_name" : section === "employees" ? "display_name" : "name", `%${q}%`);
    if (section === "customers" && context.customerVisibility === "assigned") {
      const employeeId = await ownEmployee(context);
      const assigned = await client.from("appointments").select("customer_id").eq("business_id", business.id).eq("employee_id", employeeId).limit(5000);
      if (assigned.error) throw assigned.error;
      const ids = [...new Set((assigned.data ?? []).map((item) => item.customer_id))];
      if (!ids.length) return reply({ rows: [], total: 0, hasMore: false });
      query = query.in("id", ids);
    }
    const result = await query.order("created_at", { ascending: false }).range(offset, offset + limit - 1);
    if (result.error) throw result.error;
    const rows = (result.data ?? []) as unknown as Record<string, unknown>[];
    return reply({ rows: rows.map((row) => {
      const visible = { ...row };
      if (section === "inventory" && !context.financialVisibility) {
        delete visible.purchase_price_minor;
        delete visible.sale_price_minor;
      }
      return { ...visible, roleTitle: row.title, title: row.full_name ?? row.display_name ?? row.name, subtitle: section === "customers" ? row.phone : section === "employees" ? row.title : section === "inventory" ? row.sku : section === "services" ? `${row.duration_minutes} dk` : "Kampanya" };
    }), total: result.count ?? 0, hasMore: offset + limit < (result.count ?? 0) });
  } catch (error) { return failed(error); }
}

const id = z.string().uuid().optional();
const schemas = {
  appointments: z.object({ id: z.string().uuid(), status: z.enum(["confirmed", "completed", "cancelled", "no_show"]) }).strict(),
  services: z.object({ id, name: z.string().trim().min(2).max(120), description: z.string().trim().max(1000).default(""), durationMinutes: z.number().int().min(5).max(1440), price: z.number().min(0).max(10_000_000), active: z.boolean() }).strict(),
  employees: z.object({ id, displayName: z.string().trim().min(2).max(120), title: z.string().trim().max(120).default(""), bio: z.string().trim().max(1000).default(""), active: z.boolean() }).strict(),
  customers: z.object({ id, fullName: z.string().trim().min(2).max(120), phone: z.string().trim().min(10).max(24), email: z.union([z.email(), z.literal("")]).default(""), notes: z.string().trim().max(2000).default("") }).strict(),
  inventory: z.object({ id, name: z.string().trim().min(2).max(120), sku: z.string().trim().min(1).max(80), minimumStock: z.number().int().min(0).max(1_000_000), purchasePrice: z.number().min(0).max(10_000_000), salePrice: z.number().min(0).max(10_000_000), active: z.boolean() }).strict(),
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
      let check = client.from("appointments").select("id,status").eq("id", values.id!).eq("business_id", business.id).eq("branch_id", branch.id);
      if (context.role === "EMPLOYEE") check = check.eq("employee_id", await ownEmployee(context));
      const existing = await check.maybeSingle();
      if (existing.error) throw existing.error;
      if (!existing.data) throw new BusinessAccessError("Randevu bulunamadı.", 404);
      const transitions: Record<string, string[]> = { pending: ["confirmed", "cancelled"], confirmed: ["completed", "cancelled", "no_show"] };
      if (!transitions[existing.data.status]?.includes(values.status)) throw new BusinessAccessError("Bu durum değişikliği geçerli değil.", 409);
      const result = await client.rpc("business_update_appointment_status", { p_appointment_id: values.id, p_status: values.status }); if (result.error) throw result.error;
    } else if (isStock && "quantity" in values) {
      const existing = await client.from("inventory_products").select("id").eq("id", values.id).eq("business_id", business.id).maybeSingle(); if (!existing.data) throw new BusinessAccessError("Ürün bulunamadı.", 404);
      const result = await client.rpc("adjust_inventory_stock", { p_product_id: values.id, p_quantity_delta: values.quantity, p_note: values.note || null }); if (result.error) throw result.error;
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
      if (result.error) throw result.error;
      if (!result.data) throw new BusinessAccessError("Kayıt bulunamadı.", 404);
      if (table === "services") { const linked = await client.from("branch_services").upsert({ branch_id: branch.id, service_id: result.data.id, active: "active" in values ? values.active : true }, { onConflict: "branch_id,service_id" }); if (linked.error) throw linked.error; }
      if (table === "employees" && !entityId) { const linked = await client.from("employee_branches").upsert({ branch_id: branch.id, employee_id: result.data.id }, { onConflict: "employee_id,branch_id" }); if (linked.error) throw linked.error; }
    }
    revalidatePath(`/business/${section}`); revalidatePath("/business/dashboard"); revalidateTag("marketplace", "max");
    return reply({ saved: true });
  } catch (error) { return failed(error); }
}
