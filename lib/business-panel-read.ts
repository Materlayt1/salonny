import "server-only";
import type { BusinessContext } from "@/lib/business-context";
import { BusinessAccessError } from "@/lib/business-request-context";
import { businessDateKey, calendarDayBounds } from "@/lib/business-calendar";

export async function ownEmployee(context: BusinessContext) {
  const result = await context.supabase.from("employees").select("id").eq("business_id", context.business.id).eq("user_id", context.user.id).eq("active", true).limit(2);
  if (result.error) throw new BusinessAccessError("Çalışan bilgisi alınamadı.", 503);
  if (!result.data || result.data.length !== 1) throw new BusinessAccessError("Tek bir aktif çalışan eşleşmesi gerekiyor.", 403);
  return result.data[0].id as string;
}
export async function appointmentsQuery(context: BusinessContext, date?: string) {
  if (!context.permissions.calendar) throw new BusinessAccessError("Takvim erişim yetkin yok.", 403);
  const fields = ["id,employee_id,starts_at,ends_at,status,employees(display_name),appointment_items(name_snapshot)", ...(context.customerVisibility !== "none" ? ["customers(full_name,phone)"] : []), ...(context.financialVisibility ? ["total_minor,currency"] : [])].join(",");
  let query = context.supabase.from("appointments").select(fields, { count: "exact" }).eq("business_id", context.business.id).eq("branch_id", context.branch.id);
  if (context.role === "EMPLOYEE") query = query.eq("employee_id", await ownEmployee(context));
  if (date) {
    let bounds: { start: string; end: string };
    try { bounds = calendarDayBounds(date, context.branch.timezone); } catch { throw new BusinessAccessError("Geçersiz tarih veya saat dilimi.", 422); }
    query = query.gte("starts_at", bounds.start).lt("starts_at", bounds.end);
  }
  return { query };
}
export type AppointmentRow = { id: string; employee_id: string; starts_at: string; ends_at: string; status: string; total_minor?: number; currency?: string; customers?: { full_name: string; phone: string } | { full_name: string; phone: string }[] | null; employees: { display_name: string } | { display_name: string }[] | null; appointment_items: { name_snapshot: string }[] | null };
function one<T>(value: T | T[] | null | undefined) { return Array.isArray(value) ? value[0] : value; }
export function appointmentRows(rows: AppointmentRow[], context: BusinessContext) {
  return rows.map((row) => ({ id: row.id, title: context.customerVisibility === "none" ? "Müşteri" : one(row.customers)?.full_name ?? "Müşteri", subtitle: `${row.appointment_items?.[0]?.name_snapshot ?? "Hizmet"} · ${one(row.employees)?.display_name ?? "Çalışan"}`, phone: context.customerVisibility === "none" ? "" : one(row.customers)?.phone ?? "", status: row.status, startsAt: row.starts_at, endsAt: row.ends_at, employeeId: row.employee_id, ...(context.financialVisibility ? { amountMinor: row.total_minor, currency: row.currency } : {}) }));
}
/** One minimal DTO for web SSR and native dashboard. No raw private rows escape. */
export async function readBusinessDashboard(context: BusinessContext, now = new Date()) {
  const { supabase: client, business, branch } = context;
  const timezone = branch.timezone;
  const date = businessDateKey(now, timezone);
  const { query: today } = context.permissions.calendar ? await appointmentsQuery(context, date) : { query: null };
  const { query: future } = context.permissions.calendar ? await appointmentsQuery(context) : { query: null };
  const signal = AbortSignal.timeout(10_000);
  const empty = { data: [], count: null, error: null };
  const [appointments, upcoming, services, employees, customers] = await Promise.all([
    today ? today.order("starts_at").order("id").limit(8).abortSignal(signal) : empty,
    future ? future.gte("starts_at", now.toISOString()).in("status", ["pending", "confirmed"]).order("starts_at").order("id").limit(5).abortSignal(signal) : empty,
    client.from("branch_services").select("service_id,services!inner(active,business_id)", { count: "exact", head: true }).eq("branch_id", branch.id).eq("active", true).eq("services.active", true).eq("services.business_id", business.id).abortSignal(signal),
    client.from("employee_branches").select("employee_id,employees!inner(active,business_id)", { count: "exact", head: true }).eq("branch_id", branch.id).eq("employees.active", true).eq("employees.business_id", business.id).abortSignal(signal),
    context.customerVisibility === "all" && context.permissions.customers ? client.from("customers").select("id", { count: "exact", head: true }).eq("business_id", business.id).abortSignal(signal) : empty,
  ]);
  if ([appointments, upcoming, services, employees, customers].some((result) => result.error)) throw new BusinessAccessError("Özet alınamadı. Yeniden dene.", 503);
  const counts = [services.count, employees.count, ...(context.permissions.calendar ? [appointments.count] : []), ...(context.customerVisibility === "all" && context.permissions.customers ? [customers.count] : [])];
  if (counts.some((value) => !Number.isSafeInteger(value) || value === null || value < 0)) throw new BusinessAccessError("Özet toplamları doğrulanamadı. Yeniden dene.", 503);
  return { date, timezone, rows: appointmentRows((appointments.data ?? []) as unknown as AppointmentRow[], context), upcoming: appointmentRows((upcoming.data ?? []) as unknown as AppointmentRow[], context), total: appointments.count ?? 0, hasMore: false, metrics: [...(appointments.count !== null ? [{ label: "Bugünkü randevular", value: String(appointments.count), icon: "calendar" }] : []), { label: "Şubedeki aktif hizmetler", value: String(services.count ?? 0), icon: "scissors" }, { label: "Şubedeki çalışanlar", value: String(employees.count ?? 0), icon: "users" }, ...(customers.count !== null ? [{ label: "İşletme müşterileri", value: String(customers.count), icon: "customer" }] : [])] };
}
