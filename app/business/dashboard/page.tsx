import Link from "next/link";
import { CalendarDays, Plus, Scissors, UsersRound, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { BusinessReportOverview } from "@/components/business-report-overview";
import { requireBusinessContext } from "@/lib/business-context";
import { BusinessAccessError } from "@/lib/business-request-context";
import { readBusinessDashboard } from "@/lib/business-panel-read";
import { readBusinessReport } from "@/lib/business-report-server";

const statusLabels: Record<string,string> = { pending: "Bekliyor", confirmed: "Onaylandı", completed: "Tamamlandı", cancelled: "İptal", no_show: "Gelmedi" };
const icons = { calendar: CalendarDays, scissors: Scissors, users: UsersRound, customer: UserPlus };
export default async function BusinessDashboardPage() {
  const context = await requireBusinessContext();
  const canReport = context.permissions.reports && context.financialVisibility;
  const [dashboardResult, reportResult] = await Promise.allSettled([readBusinessDashboard(context), canReport ? readBusinessReport(context, { days: 7, allBranches: false, dimension: "service", offset: 0 }) : Promise.resolve(null)]);
  const dashboard = dashboardResult.status === "fulfilled" ? dashboardResult.value : null;
  const report = reportResult.status === "fulfilled" ? reportResult.value : null;
  const elevated = context.role === "OWNER" || context.role === "MANAGER";
  const dateTime = (value: string) => new Intl.DateTimeFormat("tr-TR", { timeZone: context.branch.timezone, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
  const calendar = context.permissions.calendar;
  return <div className="mx-auto max-w-[1400px] space-y-5">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-2xl font-semibold">Özet</h1><p className="mt-1 text-sm text-[#686872]">{context.business.name} · {context.branch.name} · {context.branch.timezone}{context.role === "EMPLOYEE" ? " · yalnız kendi randevuların" : ""}</p></div>{calendar && <ButtonLink href="/business/calendar" className="h-11"><Plus className="h-4 w-4" /> Takvimi aç</ButtonLink>}</header>
    {!dashboard ? <div role="alert" className="surface p-5"><h2 className="font-semibold">Özet alınamadı</h2><p className="mt-2 text-sm">{dashboardResult.status === "rejected" && dashboardResult.reason instanceof BusinessAccessError ? dashboardResult.reason.message : "Şube özeti şu anda alınamıyor. Yeniden dene."}</p><Link href="/business/dashboard" className="mt-3 inline-block text-sm text-[#5B3BE7]">Özeti yeniden yükle</Link></div> : <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{dashboard.metrics.map((metric)=>{ const Icon = icons[metric.icon as keyof typeof icons] ?? CalendarDays; return <article className="surface p-5" key={metric.label}><Icon className="h-5 w-5 text-[#6C4BF4]" /><h2 className="mt-3 text-xs text-[#686872]">{metric.label}</h2><strong className="mt-2 block text-2xl font-semibold">{metric.value}</strong></article>; })}</div>
      {calendar && <div className="grid gap-4 xl:grid-cols-2">{[{ title:"Bugünün programı", rows:dashboard.rows, note:`${dashboard.total} randevu · ilk 8 kayıt · tüm durumlar` }, { title:"Yaklaşan randevular", rows:dashboard.upcoming, note:"Seçili şube · en yakın 5 bekleyen/onaylı randevu" }].map((group)=><article className="surface min-w-0 p-5" key={group.title}><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">{group.title}</h2><Link href="/business/appointments" className="text-xs text-[#5B3BE7]">Tüm randevular</Link></div><p className="mt-2 text-xs text-[#686872]">{group.note}</p>{group.rows.length ? <ul className="mt-4 divide-y">{group.rows.map((row)=><li key={row.id} className="flex min-w-0 flex-wrap items-center gap-3 py-3"><span className="text-xs">{dateTime(row.startsAt)}</span><div className="min-w-0 flex-1"><strong className="block truncate text-sm font-medium">{row.title}</strong><span className="text-xs text-[#686872]">{row.subtitle}</span></div><Badge tone={row.status === "confirmed" ? "green" : row.status === "pending" ? "amber" : "gray"}>{statusLabels[row.status] ?? "Randevu"}</Badge></li>)}</ul> : <p className="mt-4 text-sm text-[#686872]">Bu kapsamda randevu yok.</p>}</article>)}</div>}
    </>}
    {canReport ? <section className="space-y-4"><div className="flex items-center justify-between gap-3"><h2 className="font-semibold">Son 7 tam gün ve gelecek planı</h2><Link href="/business/reports?days=7" className="text-xs text-[#5B3BE7]">Ayrıntılı rapor</Link></div>{report ? <BusinessReportOverview report={report} compact /> : <p role="alert" className="surface p-5 text-sm">Rapor özeti alınamadı. Sıfır gelir veya doluluk gösterilmedi. <Link href="/business/dashboard" className="text-[#5B3BE7]">Yeniden dene</Link></p>}</section> : <p className="surface p-5 text-xs text-[#686872]">Mali özet ve dönem grafikleri için rapor izni ve finansal görünürlük gerekir.</p>}
    <nav aria-label="Hızlı işlemler" className="surface flex flex-wrap gap-4 p-5 text-sm text-[#5B3BE7]">{calendar && <Link href="/business/calendar">Takvim ve randevular</Link>}{context.permissions.customers && context.customerVisibility !== "none" && <Link href="/business/customers">Müşteriler</Link>}{elevated && <><Link href="/business/services">Hizmetleri yönet</Link><Link href="/business/settings">İşletme profilini düzenle</Link></>}</nav>
  </div>;
}
