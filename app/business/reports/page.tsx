import Link from "next/link";
import { redirect } from "next/navigation";
import { BusinessReportExport } from "@/components/business-report-export";
import { BusinessReportOverview } from "@/components/business-report-overview";
import { requireBusinessPermission } from "@/lib/business-context";
import { BusinessAccessError } from "@/lib/business-request-context";
import { businessReportPageQuery } from "@/lib/business-report-page-query";
import { readBusinessReport } from "@/lib/business-report-server";
import { formatReportMoney } from "@/lib/business-report-format";

export default async function BusinessReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await requireBusinessPermission("reports");
  if (!context.financialVisibility) redirect("/business/dashboard");
  const parsed = businessReportPageQuery.safeParse(Object.fromEntries(Object.entries(await searchParams).filter(([, value]) => value !== undefined)));
  if (!parsed.success) return <div className="surface p-6"><h1 className="text-xl font-semibold">Rapor filtrelerini kontrol et</h1><p className="mt-2 text-sm">Dönem, şube kapsamı veya kırılım sayfası geçersiz.</p><Link href="/business/reports" className="mt-4 inline-block text-[#5B3BE7]">Filtreleri sıfırla</Link></div>;
  const selection = parsed.data;
  let report;
  try { report = await readBusinessReport(context, { days: Number(selection.days) as 7 | 30 | 90, allBranches: selection.allBranches === "true", dimension: selection.dimension, offset: Number(selection.offset) }); }
  catch (error) { return <div className="surface p-6"><h1 className="text-xl font-semibold">Rapor alınamadı</h1><p role="alert" className="mt-2 text-sm">{error instanceof BusinessAccessError ? error.message : "Rapor şu anda hesaplanamıyor. Yeniden dene."}</p><Link href="/business/reports" className="mt-4 inline-block text-[#5B3BE7]">Raporu yeniden yükle</Link></div>; }
  const currencies = [...new Set([...report.summary.current.values, ...report.summary.previous.values].map((value) => value.currency))].sort();
  const href = (offset: number) => "/business/reports?" + new URLSearchParams({ days: selection.days, allBranches: selection.allBranches, dimension: selection.dimension, offset: String(offset), ...(selection.currency ? { currency: selection.currency } : {}) });
  return <div className="mx-auto max-w-[1400px] space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-semibold">Raporlar</h1><p className="mt-1 text-sm text-[#686872]">{context.business.name} · {report.scope.allBranches ? "Tüm şubeler" : context.branch.name}{report.scope.employeeId ? " · yalnız sana atanmış randevular" : ""}</p><p className="mt-1 text-xs text-[#686872]">Mobil ile aynı tam dönem hesap motoru. Müşteri adları ve telefonları bu rapora eklenmez.</p></div><BusinessReportExport report={report} /></header>
    <form method="get" action="/business/reports" className="surface flex flex-wrap items-end gap-3 p-4">
      <label className="grid gap-2 text-xs">Tamamlanmış günler<select name="days" defaultValue={selection.days} className="h-11 rounded-xl border bg-white px-3">{[7,30,90].map((value)=><option key={value} value={value}>{value} gün</option>)}</select></label>
      <label className="grid gap-2 text-xs">Şube kapsamı<select name="allBranches" defaultValue={selection.allBranches} className="h-11 rounded-xl border bg-white px-3"><option value="false">Seçili şube</option><option value="true">Tüm şubeler</option></select></label>
      <label className="grid gap-2 text-xs">Kırılım<select name="dimension" defaultValue={selection.dimension} className="h-11 rounded-xl border bg-white px-3"><option value="service">Hizmet</option><option value="employee">Uzman</option><option value="branch">Şube</option></select></label>
      {currencies.length > 1 && <label className="grid gap-2 text-xs">Para birimi<select name="currency" defaultValue={currencies.includes(selection.currency ?? "") ? selection.currency : currencies.includes("TRY") ? "TRY" : currencies[0]} className="h-11 rounded-xl border bg-white px-3">{currencies.map((value)=><option key={value}>{value}</option>)}</select></label>}
      <button type="submit" className="h-11 rounded-xl bg-[#6C4BF4] px-5 text-sm font-medium text-white">Raporu getir</button>
    </form>
    <BusinessReportOverview report={report} currency={selection.currency} />
    <section className="surface min-w-0 p-5"><h2 className="font-semibold">Dönem kırılımı</h2><p className="mt-2 text-xs text-[#686872]">{report.breakdown.total} grup · sayfa başına 25 · özet sayıları bu sayfayla sınırlı değildir.</p>{selection.dimension === "service" && <p className="mt-2 text-xs text-[#686872]">Hizmet katılımı: bir randevu birden fazla hizmet içerebilir. Aynı hizmette bir kez sayılır. Randevu tutarı hizmetlere paylaştırılmaz.</p>}
      {!report.breakdown.rows.length ? <p className="mt-4 text-sm">Bu sayfada kırılım kaydı yok.</p> : <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[600px] text-left text-xs"><caption className="sr-only">Seçili dönemin {selection.dimension === "service" ? "hizmet" : selection.dimension === "employee" ? "uzman" : "şube"} kırılımı</caption><thead><tr>{["Ad", "Randevu", "Tamamlandı", "İptal", "Gelmedi", "Tamamlanan randevu tutarı"].map((label)=><th key={label} scope="col" className="border-b p-3 font-medium">{label}</th>)}</tr></thead><tbody>{report.breakdown.rows.map((row)=><tr key={row.id}><th scope="row" className="border-b p-3 font-medium">{row.label}</th><td className="border-b p-3">{row.total}</td><td className="border-b p-3">{row.completed}</td><td className="border-b p-3">{row.cancelled}</td><td className="border-b p-3">{row.noShow}</td><td className="border-b p-3">{row.values === null ? "Hizmete paylaştırılmaz" : row.values.length ? row.values.map((value)=><span key={value.currency} className="block">{formatReportMoney(value.minor, value.currency)}</span>) : "Yok"}</td></tr>)}</tbody></table></div>}
      <nav aria-label="Rapor kırılım sayfaları" className="mt-4 flex flex-wrap gap-4 text-sm text-[#5B3BE7]">{report.breakdown.offset > 0 && <Link href={href(Math.max(0,report.breakdown.offset-25))}>Önceki sayfa</Link>}{report.breakdown.hasMore && <Link href={href(report.breakdown.offset+25)}>Sonraki 25 kayıt</Link>}</nav>
    </section>
    <footer className="text-xs leading-6 text-[#686872]">Bu ekran salt okunurdur. CSV, seçili dönemin tüm günlük özetini ve para birimlerini içerir; tek tek müşteri/randevu dökümü değildir. {context.role !== "EMPLOYEE" && <>Değerlendirmeler ayrı <Link className="text-[#5B3BE7]" href="/business/reviews">Değerlendirmeler</Link> ekranındadır.</>}</footer>
  </div>;
}
