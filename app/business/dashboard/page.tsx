import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  ChevronRight,
  Clock3,
  Plus,
  TrendingUp,
  UserPlus,
  UsersRound,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { createServerClientOptional } from "@/lib/supabase/server";

const TIMEZONE = "Europe/Istanbul";
const DAY_MS = 24 * 60 * 60 * 1_000;

type AppointmentStatus = "pending" | "confirmed" | "completed" | "cancelled" | "no_show";

type AppointmentRow = {
  id: string;
  starts_at: string;
  ends_at: string;
  status: AppointmentStatus;
  total_minor: number;
  currency: string;
  customers: { full_name: string } | { full_name: string }[] | null;
  employees: { display_name: string } | { display_name: string }[] | null;
  appointment_items: { name_snapshot: string }[] | null;
};

type PaymentRow = {
  appointment_id: string | null;
  amount_minor: number;
  paid_at: string | null;
  created_at: string;
};

type WorkingHourRow = {
  weekday: number;
  starts_at: string;
  ends_at: string;
};

type BusinessRow = {
  name: string;
  category_id: string | null;
  phone: string | null;
  status: string;
};

const statusLabels: Record<AppointmentStatus, string> = {
  pending: "Bekliyor",
  confirmed: "Onaylandı",
  completed: "Tamamlandı",
  cancelled: "İptal",
  no_show: "Gelmedi",
};

function relation<T>(value: T | T[] | null) {
  return Array.isArray(value) ? value[0] : value;
}

function dateKey(value: Date | string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(typeof value === "string" ? new Date(value) : value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function minutesBetween(start: string, end: string) {
  const toMinutes = (value: string) => {
    const [hours, minutes] = value.split(":").map(Number);
    return hours * 60 + minutes;
  };
  return Math.max(0, toMinutes(end) - toMinutes(start));
}

function appointmentMinutes(row: AppointmentRow) {
  return Math.max(0, (new Date(row.ends_at).getTime() - new Date(row.starts_at).getTime()) / 60_000);
}

function percentageChange(current: number, previous: number) {
  if (previous === 0) return { change: current === 0 ? "—" : "Yeni", positive: true };
  const change = Math.round(((current - previous) / previous) * 100);
  return { change: `${change > 0 ? "+" : ""}${change}%`, positive: change >= 0 };
}

function money(minor: number, currency = "TRY") {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(minor / 100);
}

function time(value: string) {
  return new Intl.DateTimeFormat("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: TIMEZONE,
  }).format(new Date(value));
}

export default async function BusinessDashboardPage() {
  const supabase = await createServerClientOptional();
  if (!supabase) redirect("/auth/login?next=/business/dashboard");

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login?next=/business/dashboard");

  const { data: membership } = await supabase
    .from("business_members")
    .select("business_id")
    .eq("user_id", user.id)
    .eq("active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!membership) redirect("/business");

  const now = new Date();
  const today = dateKey(now);
  const todayStart = new Date(`${today}T00:00:00+03:00`);
  const tomorrowStart = new Date(todayStart.getTime() + DAY_MS);
  const yesterdayStart = new Date(todayStart.getTime() - DAY_MS);
  const chartStart = new Date(todayStart.getTime() - 6 * DAY_MS);
  const todayWeekday = new Date(`${today}T12:00:00+03:00`).getUTCDay();
  const yesterdayWeekday = new Date(yesterdayStart.getTime() + 12 * 60 * 60 * 1_000).getUTCDay();

  const [
    businessResult,
    activityResult,
    upcomingResult,
    paymentsResult,
    todayCustomersResult,
    yesterdayCustomersResult,
    workingHoursResult,
    locationsResult,
    imagesResult,
    businessHoursResult,
    servicesResult,
    employeesResult,
    settingsResult,
  ] = await Promise.all([
    supabase.from("businesses").select("name,category_id,phone,status").eq("id", membership.business_id).maybeSingle(),
    supabase.from("appointments").select("id,starts_at,ends_at,status,total_minor,currency,customers(full_name),employees(display_name),appointment_items(name_snapshot)").eq("business_id", membership.business_id).gte("starts_at", chartStart.toISOString()).lt("starts_at", tomorrowStart.toISOString()).order("starts_at", { ascending: true }),
    supabase.from("appointments").select("id,starts_at,ends_at,status,total_minor,currency,customers(full_name),employees(display_name),appointment_items(name_snapshot)").eq("business_id", membership.business_id).gte("starts_at", now.toISOString()).in("status", ["pending", "confirmed"]).order("starts_at", { ascending: true }).limit(5),
    supabase.from("payments").select("appointment_id,amount_minor,paid_at,created_at").eq("business_id", membership.business_id).eq("status", "paid").gte("created_at", chartStart.toISOString()).lt("created_at", tomorrowStart.toISOString()),
    supabase.from("customers").select("id", { count: "exact", head: true }).eq("business_id", membership.business_id).gte("created_at", todayStart.toISOString()).lt("created_at", tomorrowStart.toISOString()),
    supabase.from("customers").select("id", { count: "exact", head: true }).eq("business_id", membership.business_id).gte("created_at", yesterdayStart.toISOString()).lt("created_at", todayStart.toISOString()),
    supabase.from("employee_working_hours").select("weekday,starts_at,ends_at").eq("business_id", membership.business_id).in("weekday", [todayWeekday, yesterdayWeekday]),
    supabase.from("business_locations").select("id", { count: "exact", head: true }).eq("business_id", membership.business_id),
    supabase.from("business_images").select("id", { count: "exact", head: true }).eq("business_id", membership.business_id),
    supabase.from("business_hours").select("id", { count: "exact", head: true }).eq("business_id", membership.business_id),
    supabase.from("services").select("id", { count: "exact", head: true }).eq("business_id", membership.business_id).eq("active", true),
    supabase.from("employees").select("id", { count: "exact", head: true }).eq("business_id", membership.business_id).eq("active", true),
    supabase.from("business_settings").select("business_id", { count: "exact", head: true }).eq("business_id", membership.business_id),
  ]);

  const business = businessResult.data as BusinessRow | null;
  if (!business) redirect("/business");

  const activity = (activityResult.data ?? []) as unknown as AppointmentRow[];
  const upcoming = (upcomingResult.data ?? []) as unknown as AppointmentRow[];
  const payments = (paymentsResult.data ?? []) as PaymentRow[];
  const workingHours = (workingHoursResult.data ?? []) as WorkingHourRow[];
  const activeStatuses: AppointmentStatus[] = ["pending", "confirmed", "completed"];
  const todayAppointments = activity.filter((row) => dateKey(row.starts_at) === today && activeStatuses.includes(row.status));
  const yesterdayKey = dateKey(yesterdayStart);
  const yesterdayAppointments = activity.filter((row) => dateKey(row.starts_at) === yesterdayKey && activeStatuses.includes(row.status));

  const paidAppointmentIds = new Set(payments.map((payment) => payment.appointment_id).filter(Boolean));
  const revenueByDay = new Map<string, number>();
  for (const payment of payments) {
    const key = dateKey(payment.paid_at ?? payment.created_at);
    revenueByDay.set(key, (revenueByDay.get(key) ?? 0) + payment.amount_minor);
  }
  for (const appointment of activity) {
    if (appointment.status !== "completed" || paidAppointmentIds.has(appointment.id)) continue;
    const key = dateKey(appointment.starts_at);
    revenueByDay.set(key, (revenueByDay.get(key) ?? 0) + appointment.total_minor);
  }

  const dailyRevenue = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(chartStart.getTime() + index * DAY_MS);
    const key = dateKey(date);
    return {
      key,
      label: new Intl.DateTimeFormat("tr-TR", { weekday: "short", timeZone: TIMEZONE }).format(date),
      value: revenueByDay.get(key) ?? 0,
    };
  });
  const maxRevenue = Math.max(...dailyRevenue.map((day) => day.value), 1);
  const todayRevenue = revenueByDay.get(today) ?? 0;
  const yesterdayRevenue = revenueByDay.get(yesterdayKey) ?? 0;

  const workingMinutes = (weekday: number) => workingHours
    .filter((row) => row.weekday === weekday)
    .reduce((total, row) => total + minutesBetween(row.starts_at, row.ends_at), 0);
  const occupancy = (appointments: AppointmentRow[], weekday: number) => {
    const available = workingMinutes(weekday);
    if (!available) return 0;
    const booked = appointments.reduce((total, row) => total + appointmentMinutes(row), 0);
    return Math.min(100, Math.round((booked / available) * 100));
  };
  const todayOccupancy = occupancy(todayAppointments, todayWeekday);
  const yesterdayOccupancy = occupancy(yesterdayAppointments, yesterdayWeekday);
  const todayCustomerCount = todayCustomersResult.count ?? 0;
  const yesterdayCustomerCount = yesterdayCustomersResult.count ?? 0;

  const stats = [
    { label: "Bugünkü randevular", value: String(todayAppointments.length), ...percentageChange(todayAppointments.length, yesterdayAppointments.length), icon: CalendarDays },
    { label: "Bugünkü ciro", value: money(todayRevenue), ...percentageChange(todayRevenue, yesterdayRevenue), icon: WalletCards },
    { label: "Yeni müşteriler", value: String(todayCustomerCount), ...percentageChange(todayCustomerCount, yesterdayCustomerCount), icon: UserPlus },
    { label: "Doluluk oranı", value: `%${todayOccupancy}`, ...percentageChange(todayOccupancy, yesterdayOccupancy), icon: TrendingUp },
  ];

  const profileChecks = [
    { complete: Boolean(business.category_id), label: "kategori" },
    { complete: Boolean(business.phone), label: "iletişim" },
    { complete: (locationsResult.count ?? 0) > 0, label: "konum" },
    { complete: (imagesResult.count ?? 0) > 0, label: "fotoğraf" },
    { complete: (businessHoursResult.count ?? 0) > 0, label: "çalışma saatleri" },
    { complete: (servicesResult.count ?? 0) > 0, label: "hizmet" },
    { complete: (employeesResult.count ?? 0) > 0, label: "çalışan" },
    { complete: (settingsResult.count ?? 0) > 0, label: "randevu ayarları" },
  ];
  const profilePercentage = Math.round((profileChecks.filter((item) => item.complete).length / profileChecks.length) * 100);
  const missingProfileItems = profileChecks.filter((item) => !item.complete).map((item) => item.label);
  const todaySchedule = todayAppointments.slice(0, 5);
  const formattedToday = new Intl.DateTimeFormat("tr-TR", { dateStyle: "full", timeZone: TIMEZONE }).format(now);

  return (
    <div className="mx-auto max-w-[1400px]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><h1 className="text-2xl font-bold tracking-[-.03em]">Özet</h1><p className="mt-1 text-sm capitalize text-[#777781]">{formattedToday}</p></div>
        <ButtonLink href="/business/calendar" className="h-10"><Plus className="h-4 w-4" /> Takvimi aç</ButtonLink>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map(({ label, value, change, positive, icon: Icon }) => (
          <article key={label} className="surface p-5">
            <div className="flex items-start justify-between">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#F0ECFF] text-[#6C4BF4]"><Icon className="h-4.5 w-4.5" /></span>
              <span className={`flex items-center gap-1 text-xs font-semibold ${positive ? "text-[#16A34A]" : "text-[#DC3545]"}`}>
                {change !== "—" && (positive ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />)}{change}
              </span>
            </div>
            <span className="mt-4 block text-xs text-[#777781]">{label}</span><strong className="mt-2 block text-2xl">{value}</strong><span className="mt-1 block text-[10px] text-[#A1A1AA]">düne göre</span>
          </article>
        ))}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.25fr_.75fr]">
        <article className="surface p-5">
          <div className="flex items-center justify-between"><div><h2 className="font-semibold">Gelir performansı</h2><p className="mt-1 text-xs text-[#777781]">Son 7 gün · tamamlanan/ödenen randevular</p></div><strong className="text-sm">{money(dailyRevenue.reduce((total, day) => total + day.value, 0))}</strong></div>
          <div className="mt-8 flex h-60 items-end gap-3 border-b border-[#ECECF1]">
            {dailyRevenue.map((day) => <div key={day.key} className="group relative flex h-full flex-1 items-end" title={`${day.label}: ${money(day.value)}`}><span className="w-full min-w-2 rounded-t-md bg-[#7E61F5] transition group-hover:bg-[#5B3BE7]" style={{ height: day.value ? `${Math.max(5, (day.value / maxRevenue) * 100)}%` : "2px", opacity: day.value ? 0.8 : 0.18 }} /></div>)}
          </div>
          <div className="mt-3 grid grid-cols-7 text-center text-[10px] capitalize text-[#A1A1AA]">{dailyRevenue.map((day) => <span key={day.key}>{day.label}</span>)}</div>
        </article>

        <article className="surface p-5">
          <div className="flex items-center justify-between"><div><h2 className="font-semibold">Bugünün programı</h2><p className="mt-1 text-xs text-[#777781]">{todayAppointments.length} randevu</p></div><ButtonLink href="/business/calendar" variant="ghost" className="h-8 px-3">Takvim</ButtonLink></div>
          {todaySchedule.length ? <div className="mt-5 grid gap-3">{todaySchedule.map((item) => { const customer = relation(item.customers); return <div key={item.id} className="flex items-center gap-3"><span className="w-11 text-xs font-semibold">{time(item.starts_at)}</span><div className="h-11 w-1 rounded-full bg-[#6C4BF4]" /><div className="min-w-0"><strong className="block truncate text-xs">{customer?.full_name ?? "İsimsiz müşteri"}</strong><span className="text-[10px] text-[#777781]">{item.appointment_items?.[0]?.name_snapshot ?? "Hizmet"}</span></div><Badge tone={item.status === "confirmed" ? "green" : item.status === "pending" ? "amber" : "gray"} className="ml-auto">{statusLabels[item.status]}</Badge></div>; })}</div> : <div className="mt-5 rounded-xl border border-dashed border-[#D9D4F3] p-6 text-center"><CalendarDays className="mx-auto h-6 w-6 text-[#8B75EA]" /><strong className="mt-3 block text-sm">Bugün randevu yok</strong><p className="mt-1 text-xs leading-5 text-[#777781]">Yeni randevular burada otomatik görünecek.</p></div>}
        </article>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <article className="surface p-5 lg:col-span-2">
          <div className="flex items-center justify-between"><h2 className="font-semibold">Yaklaşan randevular</h2><Link href="/business/appointments" className="text-xs font-semibold text-[#6C4BF4]">Tümünü gör</Link></div>
          {upcoming.length ? <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[620px] text-left text-xs"><thead className="border-b border-[#ECECF1] text-[#8A8A94]"><tr>{["Saat", "Müşteri", "Hizmet", "Uzman", "Durum"].map((heading) => <th key={heading} className="pb-3 font-medium">{heading}</th>)}</tr></thead><tbody className="divide-y divide-[#F0F0F3]">{upcoming.map((row) => { const customer = relation(row.customers); const employee = relation(row.employees); return <tr key={row.id}><td className="py-3.5">{time(row.starts_at)}</td><td className="py-3.5">{customer?.full_name ?? "—"}</td><td className="py-3.5">{row.appointment_items?.[0]?.name_snapshot ?? "—"}</td><td className="py-3.5">{employee?.display_name ?? "—"}</td><td className="py-3.5"><Badge tone={row.status === "confirmed" ? "green" : "amber"}>{statusLabels[row.status]}</Badge></td></tr>; })}</tbody></table></div> : <div className="mt-4 rounded-xl border border-dashed border-[#D9D4F3] p-8 text-center"><h3 className="text-sm font-semibold">Yaklaşan randevu yok</h3><p className="mt-1 text-xs text-[#777781]">Müşteriler randevu aldığında bu liste anında güncellenir.</p></div>}
        </article>

        <article className="surface p-5">
          <h2 className="font-semibold">Hızlı işlemler</h2>
          <div className="mt-4 grid gap-2">{[{ href: "/business/calendar", label: "Randevu ekle", icon: CalendarDays }, { href: "/business/customers", label: "Müşteri ekle", icon: UsersRound }, { href: "/business/services", label: "Hizmet oluştur", icon: Plus }].map(({ href, label, icon: Icon }) => <Link key={label} href={href} className="flex items-center gap-3 rounded-xl border border-[#ECECF1] p-3 text-xs font-medium hover:border-[#CFC5F5]"><span className="grid h-8 w-8 place-items-center rounded-lg bg-[#F0ECFF] text-[#6C4BF4]"><Icon className="h-4 w-4" /></span>{label}<ChevronRight className="ml-auto h-4 w-4 text-[#A1A1AA]" /></Link>)}</div>
          <div className={`mt-5 rounded-xl p-4 ${profilePercentage === 100 ? "bg-[#EAFBF0]" : "bg-[#FFF8E8]"}`}><div className="flex items-center gap-2"><Clock3 className={`h-4 w-4 ${profilePercentage === 100 ? "text-[#15803D]" : "text-[#D97706]"}`} /><strong className="text-xs">Profilin %{profilePercentage} tamamlandı</strong></div><p className={`mt-2 text-[11px] leading-5 ${profilePercentage === 100 ? "text-[#237A42]" : "text-[#7A5A16]"}`}>{profilePercentage === 100 ? (business.status === "published" ? "Profilin yayında ve müşteriler tarafından keşfedilebilir." : "Tüm profil bilgilerin hazır. İnceleme durumunu profil düzenlemeden takip edebilirsin.") : `Eksik alanlar: ${missingProfileItems.slice(0, 3).join(", ")}.`}</p></div>
        </article>
      </div>
    </div>
  );
}
