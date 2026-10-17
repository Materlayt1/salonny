import Link from "next/link";
import { ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { requireBusinessContext } from "@/lib/business-context";
import { BusinessAccessError, getBusinessRequestContext, requirePanelPermission } from "@/lib/business-request-context";
import { notificationUuid } from "@salonny/contracts";
import { appointmentsQuery, ownEmployee, type AppointmentRow } from "@/lib/business-panel-read";
import { businessDateKey, calendarDayBounds, shiftCalendarDate } from "@/lib/business-calendar";
import { formatDate } from "@/lib/format";

type CalendarAppointment = AppointmentRow;
type Search = Promise<Record<string, string | string[] | undefined>>;
const shift = shiftCalendarDate;
function localTime(value: string, timezone: string) { return new Intl.DateTimeFormat("tr-TR", { timeZone: timezone, hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }

export default async function BusinessCalendarPage({
  searchParams,
}: {
  searchParams: Search;
}) {
  const params = await searchParams;
  const businessId = notificationUuid(params.businessId), branchId = notificationUuid(params.branchId);
  if ((params.businessId !== undefined && !businessId) || (params.branchId !== undefined && !branchId)) return <p role="alert">Takvim kapsamı geçersiz.</p>;
  const defaultContext = businessId || branchId ? null : await requireBusinessContext(["OWNER", "MANAGER", "EMPLOYEE"]);
  let context: NonNullable<typeof defaultContext>;
  try { context = defaultContext ?? await getBusinessRequestContext(new Request(`http://salonny.internal/calendar?${new URLSearchParams({ ...(businessId ? {businessId} : {}), ...(branchId ? {branchId} : {}) })}`)); }
  catch (error) { return <p role="alert">{error instanceof BusinessAccessError ? error.message : "Takvim kapsamı doğrulanamadı. Yeniden dene."}</p>; }
  const { supabase, business, branch } = context;
  if ((params.date !== undefined && typeof params.date !== "string") || (params.view !== undefined && !["day", "week", "month"].includes(params.view as string)) || (params.page !== undefined && (typeof params.page !== "string" || !/^[1-9]\d{0,3}$/.test(params.page) || Number(params.page) > 1001))) return <p role="alert">Takvim tarihi, görünümü veya sayfası geçersiz.</p>;
  let selected: string;
  try { requirePanelPermission(context, "calendar"); selected = params.date as string | undefined ?? businessDateKey(new Date(), branch.timezone); shift(selected, 0); }
  catch (error) { return <p role="alert">{error instanceof BusinessAccessError ? error.message : "Geçersiz takvim tarihi veya saat dilimi."}</p>; }
  const view =
    params.view === "week" || params.view === "month" ? params.view : "day";
  const selectedDate = new Date(`${selected}T12:00:00Z`);
  const weekday = (selectedDate.getUTCDay() + 6) % 7;
  let fromDate = selected;
  let toDate = shift(selected, 1);
  let step = 1;
  if (view === "week") {
    fromDate = shift(selected, -weekday);
    toDate = shift(fromDate, 7);
    step = 7;
  }
  if (view === "month") {
    fromDate = `${selected.slice(0, 7)}-01`;
    const next = new Date(`${fromDate}T12:00:00Z`);
    next.setUTCMonth(next.getUTCMonth() + 1);
    toDate = next.toISOString().slice(0, 10);
    step = 30;
  }
  const page = Number(params.page ?? 1);
  const pageSize = 100;
  let appointments: CalendarAppointment[];
  let employees: { id: string; display_name: string }[];
  let total: number;
  try {
    const start = calendarDayBounds(fromDate, branch.timezone).start;
    const end = calendarDayBounds(toDate, branch.timezone).start;
    const ownId = context.role === "EMPLOYEE" ? await ownEmployee(context) : null;
    let employeeQuery = supabase.from("employees").select("id,display_name,employee_branches!inner(branch_id)").eq("business_id", business.id).eq("active", true).eq("employee_branches.branch_id", branch.id);
    if (ownId) employeeQuery = employeeQuery.eq("id", ownId);
    const { query } = await appointmentsQuery(context);
    const [people, result] = await Promise.all([
      employeeQuery.order("sort_order").order("id").limit(1000).abortSignal(AbortSignal.timeout(10_000)),
      query.gte("starts_at", start).lt("starts_at", end).order("starts_at").order("id").range((page - 1) * pageSize, page * pageSize - 1).abortSignal(AbortSignal.timeout(10_000)),
    ]);
    if (people.error || result.error || result.count === null || !Number.isSafeInteger(result.count) || result.count < 0) throw new BusinessAccessError("Takvim alınamadı. Yeniden dene.", 503);
    appointments = ((result.data ?? []) as unknown as CalendarAppointment[]).map((row) => ({ id: row.id, employee_id: row.employee_id, starts_at: row.starts_at, ends_at: row.ends_at, status: row.status, employee_name: row.employee_name, service_names: row.service_names, service_label: row.service_label, ...(context.customerVisibility !== "none" ? { customer_name: row.customer_name } : {}) }));
    employees = (people.data ?? []).map(({ id, display_name }) => ({ id, display_name }));
    // Historical appointments must remain visible even if their employee was
    // deactivated or unlinked from the branch after the booking was made.
    for (const row of appointments) if (!employees.some((person) => person.id === row.employee_id)) employees.push({ id: row.employee_id, display_name: row.employee_name ?? "Çalışan" });
    total = result.count;
  } catch (error) { return <p role="alert">{error instanceof BusinessAccessError ? error.message : "Takvim alınamadı. Yeniden dene."}</p>; }
  const monthShift = (direction: number) => { const date = new Date(`${fromDate}T12:00:00Z`); date.setUTCMonth(date.getUTCMonth() + direction); return date.toISOString().slice(0, 10); };
  const previous = view === "month" ? monthShift(-1) : shift(selected, -step);
  const next = view === "month" ? monthShift(1) : shift(selected, step);
  const viewQuery = (date: string, nextView: string = view, nextPage = 1) =>
    `/business/calendar?${new URLSearchParams({ businessId: business.id, branchId: branch.id, date, view: nextView, page: String(nextPage) })}`;
  const appointmentLink = (id: string) => `/business/appointments?${new URLSearchParams({ businessId: business.id, branchId: branch.id, appointmentId: id })}`;
  return (
    <div className="mx-auto max-w-[1400px]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Randevu Takvimi</h1>
          <p className="mt-1 text-sm text-[#686872]">
            {business.name} · {branch.name} · {branch.timezone}
          </p>
        </div>
        <Link
          href={`/business/${business.slug}`}
          target="_blank"
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#6C4BF4] px-4 text-xs font-semibold text-white"
        >
          Müşteri sayfası <ExternalLink className="h-4 w-4" />
        </Link>
      </div>
      <div className="surface mt-6 overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-[#ECECF1] p-4">
          <Link
            href={viewQuery(businessDateKey(new Date(), branch.timezone))}
            className="rounded-lg border border-[#E8E8EE] px-3 py-2 text-xs font-medium"
          >
            Bugün
          </Link>
          <div className="flex">
            <Link
              href={viewQuery(previous)}
              aria-label="Önceki dönem"
              className="grid h-8 w-8 place-items-center rounded-l-lg border border-[#E8E8EE]"
            >
              <ChevronLeft className="h-4 w-4" />
            </Link>
            <Link
              href={viewQuery(next)}
              aria-label="Sonraki dönem"
              className="grid h-8 w-8 place-items-center rounded-r-lg border-y border-r border-[#E8E8EE]"
            >
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
          <strong className="text-sm">
            {view === "month"
              ? new Intl.DateTimeFormat("tr-TR", {
                  month: "long",
                  year: "numeric",
                }).format(selectedDate)
              : view === "week"
                ? `${formatDate(`${fromDate}T12:00:00Z`)} – ${formatDate(`${shift(toDate, -1)}T12:00:00Z`)}`
                : formatDate(`${selected}T12:00:00Z`, {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
          </strong>
          <div className="ml-auto flex rounded-lg bg-[#F1F1F4] p-1">
            {[
              ["day", "Gün"],
              ["week", "Hafta"],
              ["month", "Ay"],
            ].map(([key, label]) => (
              <Link
                key={key}
                href={viewQuery(selected, key)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium ${view === key ? "bg-white text-[#6C4BF4] shadow-sm" : ""}`}
              >
                {label}
              </Link>
            ))}
          </div>
        </div>
        {view === "day" ? (
          <DayView
            selected={selected}
            employees={employees}
            appointments={appointments}
            timezone={branch.timezone}
            appointmentLink={appointmentLink}
          />
        ) : (
          <ListView appointments={appointments} timezone={branch.timezone} appointmentLink={appointmentLink} />
        )}
      </div>
      <nav aria-label="Takvim kayıt sayfaları" className="mt-5 flex flex-wrap gap-4 text-sm"><span>{total} kayıt · Sayfa {page}/{Math.max(1, Math.ceil(total / pageSize))} · Bu sayfada en fazla {pageSize} kayıt</span>{page > 1 ? <Link href={viewQuery(selected, view, page - 1)}>Önceki sayfa</Link> : null}{page * pageSize < total && page < 1001 ? <Link href={viewQuery(selected, view, page + 1)}>Sonraki sayfa</Link> : null}</nav>
    </div>
  );
}

function DayView({
  selected,
  employees,
  appointments,
  timezone,
  appointmentLink,
}: {
  selected: string;
  employees: { id: string; display_name: string }[];
  appointments: CalendarAppointment[];
  timezone: string;
  appointmentLink: (id: string) => string;
}) {
  if (!employees.length)
    return (
      <Empty
        title="Takvim için çalışan ekle"
        body="Aktif çalışanlar oluşturulduğunda sütunları burada görünür."
      />
    );
  const hourOf = (value: string) => Number(new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", hourCycle: "h23" }).format(new Date(value)));
  const visible = appointments.filter((row) => row.status !== "cancelled");
  const startHour = Math.min(8, ...visible.map((row) => hourOf(row.starts_at)));
  const endHour = Math.min(24, Math.max(22, ...visible.map((row) => businessDateKey(new Date(row.ends_at), timezone) !== selected ? 24 : hourOf(row.ends_at) + 1)));
  const slotHeight = 64;
  return (
    <div className="overflow-x-auto">
      <div
        style={{ minWidth: `${Math.max(760, employees.length * 220 + 70)}px` }}
      >
        <div
          className="grid border-b border-[#ECECF1]"
          style={{
            gridTemplateColumns: `70px repeat(${employees.length}, minmax(190px, 1fr))`,
          }}
        >
          <div />
          {employees.map((employee) => {
            return (
              <div
                key={employee.id}
                className="border-l border-[#ECECF1] p-4 text-center"
              >
                <strong className="text-xs">{employee.display_name}</strong>
                <span className="mt-1 block text-[10px] text-[#22A95A]">
                  {selected}
                </span>
              </div>
            );
          })}
        </div>
        <div
          className="relative"
          style={{ height: (endHour - startHour) * slotHeight }}
        >
          <div
            className="absolute inset-0 grid"
            style={{
              gridTemplateColumns: `70px repeat(${employees.length}, minmax(190px, 1fr))`,
            }}
          >
            {Array.from({ length: employees.length + 1 }).map((_, index) => (
              <div
                key={index}
                className={index ? "border-l border-[#ECECF1]" : ""}
              />
            ))}
          </div>
          {Array.from({ length: endHour - startHour }).map((_, index) => (
            <div
              key={index}
              className="absolute inset-x-0 flex border-t border-[#ECECF1]"
              style={{ top: index * slotHeight, height: slotHeight }}
            >
              <span className="w-[70px] -translate-y-2 bg-white pr-3 text-right text-[10px] text-[#6F6F78]">
                {String(startHour + index).padStart(2, "0")}:00
              </span>
            </div>
          ))}
          {appointments
            .filter((appointment) => appointment.status !== "cancelled")
            .map((appointment) => {
              const column = employees.findIndex(
                (employee) => employee.id === appointment.employee_id,
              );
              if (column < 0) return null;
              const local = new Date(appointment.starts_at);
              const hour = Number(
                new Intl.DateTimeFormat("en-GB", {
                  hour: "2-digit",
                  hour12: false,
                  timeZone: timezone,
                }).format(local),
              );
              const minute = Number(
                new Intl.DateTimeFormat("en-GB", {
                  minute: "2-digit",
                  timeZone: timezone,
                }).format(local),
              );
              const duration = Math.max(
                30,
                (new Date(appointment.ends_at).getTime() - local.getTime()) /
                  60000,
              );
              const top =
                (((hour - startHour) * 60 + minute) / 60) * slotHeight;
              const left = `calc(70px + ${column} * ((100% - 70px) / ${employees.length}) + 5px)`;
              const width = `calc((100% - 70px) / ${employees.length} - 10px)`;
              return (
                <Link
                  href={appointmentLink(appointment.id)}
                  key={appointment.id}
                  className="absolute z-10 overflow-hidden rounded-lg border-l-[3px] border-[#6C4BF4] bg-[#EEE9FF] p-2 text-left shadow-sm transition hover:z-20 hover:brightness-[.98]"
                  style={{
                    left,
                    width,
                    top: Math.max(0, top),
                    height: Math.max(38, (duration / 60) * slotHeight - 3),
                  }}
                >
                  <strong className="block truncate text-[11px]">
                    {appointment.customer_name ?? "Müşteri"}
                  </strong>
                  <span className="mt-1 block truncate text-[10px] text-[#666672]">
                    {localTime(appointment.starts_at, timezone)} · {appointment.service_label || "Hizmet"}
                  </span>
                </Link>
              );
            })}
        </div>
      </div>
    </div>
  );
}

function ListView({ appointments, timezone, appointmentLink }: { appointments: CalendarAppointment[]; timezone: string; appointmentLink: (id: string) => string }) {
  const groups = Map.groupBy(appointments, (item) => businessDateKey(new Date(item.starts_at), timezone));
  if (!appointments.length)
    return (
      <Empty
        title="Bu dönemde randevu yok"
        body="Yeni rezervasyonlar geldiğinde takvime otomatik işlenir."
      />
    );
  return (
    <div className="grid gap-5 p-5">
      {Array.from(groups.entries()).map(([date, rows]) => (
        <section key={date}>
          <h2 className="mb-2 text-sm font-semibold">
            {formatDate(`${date}T12:00:00Z`, {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </h2>
          <div className="grid gap-2">
            {rows.map((row) => (
              <Link
                href={appointmentLink(row.id)}
                key={row.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-[#ECECF1] p-3 hover:bg-[#FAF9FF]"
              >
                <strong className="w-12 text-xs">
                  {localTime(row.starts_at, timezone)}
                </strong>
                <span className="min-w-[180px] flex-1 text-xs">
                  {row.customer_name ?? "Müşteri"} · {row.service_label || "Hizmet"}
                </span>
                <Badge
                  tone={
                    row.status === "confirmed"
                      ? "green"
                      : row.status === "pending"
                        ? "amber"
                        : row.status === "cancelled"
                          ? "red"
                          : "gray"
                  }
                >
                  {row.status}
                </Badge>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="grid min-h-64 place-items-center p-8 text-center">
      <div>
        <h2 className="font-semibold">{title}</h2>
        <p className="mt-2 text-sm text-[#686872]">{body}</p>
      </div>
    </div>
  );
}
