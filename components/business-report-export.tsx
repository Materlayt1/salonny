"use client";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BusinessReport } from "@/lib/business-report-contract";
import { buildBusinessReportCsv } from "@/lib/business-report-csv";
export function BusinessReportExport({ report }: { report: BusinessReport }) {
  function download() {
    const url = URL.createObjectURL(new Blob([buildBusinessReportCsv(report)], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url;
    anchor.download = `rapor-${report.period.from}-${report.period.toExclusive}.csv`; anchor.click();
    URL.revokeObjectURL(url);
  }
  return <Button variant="ghost" onClick={download}><Download className="h-4 w-4" /> Günlük özet CSV</Button>;
}
