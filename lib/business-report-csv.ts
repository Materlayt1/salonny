import type { BusinessReport } from "@/lib/business-report-contract";
export function buildBusinessReportCsv(report: BusinessReport) {
  const safe = (value: string | number) => { let text = String(value); if (/^[\s]*[=+\-@\t\r]/.test(text)) text = `'${text}`; return `"${text.replaceAll('"', '""')}"`; };
  const currencies = [...new Set(report.summary.current.values.map((value) => value.currency))].sort();
  const rows: (string | number)[][] = [["Gün", "Saat dilimi", "Şube kapsamı", "Randevu", "Tamamlandı", "İptal", "Gelmedi", "Planlanan dakika", ...currencies.map((currency) => `Tamamlanan randevu tutarı (tahsilat değil) — ${currency}`)]];
  // One row per day: duplicating a day's counts for each currency makes totals
  // wrong as soon as a spreadsheet user sums the appointment column.
  for (const day of report.daily) rows.push([day.date, report.period.timezone, report.scope.allBranches ? "Tüm şubeler" : report.scope.branchId!, day.total, day.completed, day.cancelled, day.noShow, day.bookedMinutes, ...currencies.map((currency) => {
    const minor = BigInt(day.values.find((value) => value.currency === currency)?.minor ?? "0");
    return `${minor / BigInt(100)}.${(minor % BigInt(100)).toString().padStart(2, "0")}`;
  })]);
  return "\uFEFF" + rows.map((row) => row.map(safe).join(",")).join("\r\n");
}
