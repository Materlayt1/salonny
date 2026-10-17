import Link from "next/link";
import { BusinessAppointmentsManager, type ManagedAppointment } from "@/components/business-appointments-manager";
import { requireBusinessContext } from "@/lib/business-context";
import { BusinessAccessError, getBusinessRequestContext, requirePanelPermission } from "@/lib/business-request-context";
import { appointmentsQuery, assertPanelAppointmentMoney, type AppointmentRow } from "@/lib/business-panel-read";
import { notificationUuid } from "@salonny/contracts";

const statuses = { pending: "Onay bekliyor", confirmed: "Onaylandı", completed: "Tamamlandı", cancelled: "İptal edildi", no_show: "Gelmedi" } as const;
const pageSize = 50;

export default async function BusinessAppointmentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const businessId = notificationUuid(params.businessId);
  const branchId = notificationUuid(params.branchId);
  const appointmentId = notificationUuid(params.appointmentId);
  if ((params.businessId !== undefined && !businessId) || (params.branchId !== undefined && !branchId)) return <p role="alert">İşletme randevularının kapsamı geçersiz.</p>;
  if (params.appointmentId !== undefined && !appointmentId) return <p role="alert">Bildirimdeki randevu bağlantısı geçersiz.</p>;
  if ((params.page !== undefined && (typeof params.page !== "string" || !/^[1-9]\d{0,3}$/.test(params.page) || Number(params.page) > 2001)) || (params.status !== undefined && params.status !== "" && (typeof params.status !== "string" || !Object.hasOwn(statuses, params.status)))) return <p role="alert">Randevu sayfası veya durum filtresi geçersiz.</p>;
  const page = Number(params.page ?? 1);
  // Keep Next login redirects outside the error boundary, and preserve the
  // normal web panel's selected-branch cookie when no explicit scope is given.
  const defaultContext = businessId || branchId ? null : await requireBusinessContext(["OWNER", "MANAGER", "EMPLOYEE"]);
  let listing: { context: NonNullable<typeof defaultContext>; appointments: ManagedAppointment[]; total: number };
  try {
    const scope = new URLSearchParams({ ...(businessId ? { businessId } : {}), ...(branchId ? { branchId } : {}) });
    const context = defaultContext ?? await getBusinessRequestContext(new Request(`http://salonny.internal/appointments?${scope}`));
    requirePanelPermission(context, "appointments");
    let { query } = await appointmentsQuery(context);
    if (appointmentId) query = query.eq("id", appointmentId);
    if (params.status) query = query.eq("status", params.status as string);
    const result = await query.order("starts_at", { ascending: false }).order("id").range((page - 1) * pageSize, page * pageSize - 1).abortSignal(AbortSignal.timeout(10_000));
    if (result.error || result.count === null || !Number.isSafeInteger(result.count) || result.count < 0) throw new BusinessAccessError("Randevular alınamadı. Yeniden dene.", 503);
    const rows = (result.data ?? []) as unknown as AppointmentRow[];
    assertPanelAppointmentMoney(rows, context);
    const appointments = rows.map((row): ManagedAppointment => ({ id: row.id, startsAt: row.starts_at, endsAt: row.ends_at, status: row.status,
      ...(context.financialVisibility ? { totalMinor: row.total_minor, currency: row.currency } : {}),
      customerName: context.customerVisibility === "none" ? "Müşteri" : row.customer_name ?? "Müşteri", customerPhone: context.customerVisibility === "none" ? "" : row.customer_phone ?? "",
      employeeName: row.employee_name ?? "Çalışan", serviceName: row.service_label || "Hizmet" }));
    listing = { context, appointments, total: result.count };
  } catch (error) {
    return <p role="alert">{error instanceof BusinessAccessError ? error.message : "Randevular alınamadı. Yeniden dene."}</p>;
  }
  const { context, appointments, total } = listing;
  const link = (next: number, focused = true) => `/business/appointments?${new URLSearchParams({ businessId: context.business.id, branchId: context.branch.id, page: String(next), ...(typeof params.status === "string" && params.status ? { status: params.status } : {}), ...(focused && appointmentId ? { appointmentId } : {}) })}`;
  return <>
    <p className="mb-4 text-sm text-[#686872]">{context.business.name} · {context.branch.name} · {context.branch.timezone}</p>
    <form className="mb-4 flex flex-wrap items-center gap-3" action="/business/appointments">
      <input type="hidden" name="businessId" value={context.business.id} /><input type="hidden" name="branchId" value={context.branch.id} />
      <label className="text-sm">Tüm kayıtlarda durum <select name="status" defaultValue={params.status ?? ""} className="ml-2 rounded-xl border border-[#E8E8EE] bg-white p-2"><option value="">Tümü</option>{Object.entries(statuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <button className="rounded-xl bg-[#6C4BF4] px-4 py-2 text-sm text-white">Filtrele</button>
      {appointmentId ? <Link href={link(1, false)} className="text-sm text-[#6C4BF4]">Tüm randevulara dön</Link> : null}
    </form>
    <p className="mb-3 text-xs text-[#686872]">Aşağıdaki arama ve hızlı durum düğmeleri yalnız bu sayfadaki kayıtları filtreler.</p>
    <BusinessAppointmentsManager key={`${context.business.id}-${context.branch.id}-${page}-${params.status ?? ""}-${appointmentId ?? ""}`} initialAppointments={appointments} financialVisible={context.financialVisibility} timezone={context.branch.timezone} scope={{ businessId: context.business.id, branchId: context.branch.id }} />
    {appointmentId && !appointments.length ? <p role="status" className="mt-4">Bu randevu artık erişebildiğin kayıtlarda bulunmuyor.</p> : null}
    <nav aria-label="Randevu sayfaları" className="mt-5 flex flex-wrap items-center gap-4 text-sm">
      <span>{total} kayıt · Sayfa {page}/{Math.max(1, Math.ceil(total / pageSize))} · En fazla {pageSize} kayıt</span>
      {page > 1 ? <Link href={link(page - 1)} className="text-[#6C4BF4]">Önceki sayfa</Link> : null}
      {page * pageSize < total && page < 2001 ? <Link href={link(page + 1)} className="text-[#6C4BF4]">Sonraki sayfa</Link> : null}
    </nav>
  </>;
}
