import { BusinessAppointmentsManager, type ManagedAppointment } from "@/components/business-appointments-manager";
import { requireBusinessContext } from "@/lib/business-context";
import { BusinessAccessError, getBusinessRequestContext, requirePanelPermission } from "@/lib/business-request-context";
import { notificationUuid } from "@salonny/contracts";
import { formatDate, formatMoney, formatTime } from "@/lib/format";
import Link from "next/link";

type AppointmentRow = { id: string; starts_at: string; ends_at: string; status: ManagedAppointment["status"]; total_minor: number; currency: string; customers: { full_name: string; phone: string } | { full_name: string; phone: string }[] | null; employees: { display_name: string } | { display_name: string }[] | null; appointment_items: { name_snapshot: string }[] | null };
function one<T>(value: T | T[] | null) { return Array.isArray(value) ? value[0] : value; }

async function loadNotificationAppointment(appointmentId: string, businessId: string | null, branchId: string | null) {
  // This request only carries scope; createRequestClientOptional uses the
  // current Next cookie session. No server-to-server HTTP call is made.
  const scope = new URLSearchParams({ ...(businessId ? { businessId } : {}), ...(branchId ? { branchId } : {}) });
  const context = await getBusinessRequestContext(new Request(`http://salonny.internal/appointments?${scope}`));
  requirePanelPermission(context, "appointments");
  let query = context.supabase.from("appointments").select("id,starts_at,status,total_minor,currency,customers(full_name),employees(display_name),appointment_items(name_snapshot)").eq("business_id", context.business.id).eq("branch_id", context.branch.id).eq("id", appointmentId);
  if (context.role === "EMPLOYEE") {
    const employee = await context.supabase.from("employees").select("id").eq("business_id", context.business.id).eq("user_id", context.user.id).eq("active", true).limit(1).maybeSingle();
    if (employee.error) throw new BusinessAccessError("Çalışan bilgisi alınamadı.", 503);
    if (!employee.data) throw new BusinessAccessError("Bu randevuya erişimin yok.", 403);
    query = query.eq("employee_id", employee.data.id);
  }
  const { data: row, error } = await query.maybeSingle();
  if (error) throw new BusinessAccessError("Randevu alınamadı. Yeniden dene.", 503);
  return { context, row };
}

export default async function BusinessAppointmentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  if (params.appointmentId !== undefined) {
    const appointmentId = notificationUuid(params.appointmentId);
    const businessId = notificationUuid(params.businessId);
    const branchId = notificationUuid(params.branchId);
    if (!appointmentId || (params.businessId !== undefined && !businessId) || (params.branchId !== undefined && !branchId)) return <p role="alert">Bildirimdeki randevu bağlantısı geçersiz.</p>;
    let target: Awaited<ReturnType<typeof loadNotificationAppointment>> | undefined;
    let failure = "Randevu alınamadı. Yeniden dene.";
    try { target = await loadNotificationAppointment(appointmentId, businessId, branchId); }
    catch (error) { if (error instanceof BusinessAccessError) failure = error.message; }
    if (!target) return <p role="alert">{failure}</p>;
    const { context, row } = target;
    const labels: Record<string, string> = { pending: "Onay bekliyor", confirmed: "Onaylandı", completed: "Tamamlandı", cancelled: "İptal edildi", no_show: "Gelmedi" };
    return <section className="mx-auto max-w-2xl"><h1 className="text-2xl font-semibold">Bildirimdeki randevu</h1><p className="mt-2 text-sm text-[#686872]">{context.business.name} · {context.branch.name}</p>{row ? <article className="surface mt-6 space-y-3 p-6"><h2 className="text-lg font-semibold">{context.customerVisibility === "none" ? "Müşteri" : one(row.customers)?.full_name ?? "Müşteri"}</h2><p>{row.appointment_items?.map((item) => item.name_snapshot).join(" · ") || "Hizmet"} · {one(row.employees)?.display_name ?? "Çalışan"}</p><p>{formatDate(row.starts_at)} · {formatTime(row.starts_at)}</p><p>{labels[row.status] ?? "Durum güncellendi"}</p>{context.financialVisibility ? <p>{formatMoney(row.total_minor, row.currency)}</p> : null}</article> : <p role="status" className="mt-6">Bu randevu artık erişebildiğin kayıtlarda bulunmuyor.</p>}<Link href="/business/appointments" className="mt-6 inline-block text-sm font-medium text-[#6C4BF4]">İşletme randevularına dön →</Link></section>;
  }
  if (params.businessId !== undefined || params.branchId !== undefined) {
    const businessId = notificationUuid(params.businessId);
    const branchId = notificationUuid(params.branchId);
    if (!businessId || (params.branchId !== undefined && !branchId)) return <p role="alert">İşletme randevularının kapsamı geçersiz.</p>;
    let listing: { context: Awaited<ReturnType<typeof getBusinessRequestContext>>; appointments: ManagedAppointment[] } | undefined;
    let failure = "Randevular alınamadı. Yeniden dene.";
    try {
      const scope = new URLSearchParams({ businessId, ...(branchId ? { branchId } : {}) });
      const context = await getBusinessRequestContext(new Request(`http://salonny.internal/appointments?${scope}`));
      requirePanelPermission(context, "appointments");
      let query = context.supabase.from("appointments").select("id,starts_at,ends_at,status,total_minor,currency,customers(full_name,phone),employees(display_name),appointment_items(name_snapshot)").eq("business_id", context.business.id).eq("branch_id", context.branch.id);
      if (context.role === "EMPLOYEE") {
        const employee = await context.supabase.from("employees").select("id").eq("business_id", context.business.id).eq("user_id", context.user.id).eq("active", true).limit(1).maybeSingle();
        if (employee.error) throw new BusinessAccessError("Çalışan bilgisi alınamadı.", 503);
        if (!employee.data) throw new BusinessAccessError("Çalışan eşleşmesi bulunamadı.", 403);
        query = query.eq("employee_id", employee.data.id);
      }
      const { data, error } = await query.order("starts_at", { ascending: false }).limit(500);
      if (error) throw new BusinessAccessError("Randevular alınamadı. Yeniden dene.", 503);
      const appointments: ManagedAppointment[] = ((data ?? []) as unknown as AppointmentRow[]).map((row) => ({ id: row.id, startsAt: row.starts_at, endsAt: row.ends_at, status: row.status, totalMinor: context.financialVisibility ? row.total_minor : 0, currency: row.currency, customerName: context.customerVisibility === "none" ? "Müşteri" : one(row.customers)?.full_name ?? "İsimsiz müşteri", customerPhone: context.customerVisibility === "none" ? "" : one(row.customers)?.phone ?? "", employeeName: one(row.employees)?.display_name ?? "—", serviceName: row.appointment_items?.map((item) => item.name_snapshot).join(" · ") || "Hizmet" }));
      listing = { context, appointments };
    } catch (error) {
      if (error instanceof BusinessAccessError) failure = error.message;
    }
    if (!listing) return <p role="alert">{failure}</p>;
    const { context, appointments } = listing;
    return <><p className="mb-4 text-sm text-[#686872]">{context.business.name} · {context.branch.name}</p><BusinessAppointmentsManager key={`${context.business.id}-${context.branch.id}`} initialAppointments={appointments} financialVisible={context.financialVisibility} scope={{ businessId: context.business.id, branchId: context.branch.id }} /></>;
  }
  const { supabase, business } = await requireBusinessContext(["OWNER", "MANAGER", "EMPLOYEE"]);
  const { data } = await supabase.from("appointments").select("id,starts_at,ends_at,status,total_minor,currency,customers(full_name,phone),employees(display_name),appointment_items(name_snapshot)").eq("business_id", business.id).order("starts_at", { ascending: false }).limit(500);
  const appointments: ManagedAppointment[] = ((data ?? []) as unknown as AppointmentRow[]).map((row) => ({ id: row.id, startsAt: row.starts_at, endsAt: row.ends_at, status: row.status, totalMinor: row.total_minor, currency: row.currency, customerName: one(row.customers)?.full_name ?? "İsimsiz müşteri", customerPhone: one(row.customers)?.phone ?? "", employeeName: one(row.employees)?.display_name ?? "—", serviceName: row.appointment_items?.[0]?.name_snapshot ?? "Hizmet" }));
  return <BusinessAppointmentsManager initialAppointments={appointments} />;
}
