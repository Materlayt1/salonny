import { NextResponse } from "next/server";
import { apiRateLimit } from "@/lib/api-security";
import { BusinessAccessError, getBusinessRequestContext } from "@/lib/business-request-context";
import { businessReportQuery, type ReportDays } from "@/lib/business-report-contract";
import { readBusinessReport } from "@/lib/business-report-server";

const reply = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store" } });

export async function GET(request: Request) {
  try {
    const parameters = new URL(request.url).searchParams;
    const keys = [...parameters.keys()];
    const parsed = businessReportQuery.safeParse(Object.fromEntries(parameters));
    if (new Set(keys).size !== keys.length || !parsed.success) return reply({ error: "İşletme, şube, dönem ve rapor sayfasını kontrol et." }, 422);
    const limited = await apiRateLimit(request, "business-report-read", 30, 60_000, { critical: true });
    if (limited) { limited.headers.set("Cache-Control", "private, no-store"); return limited; }
    const context = await getBusinessRequestContext(request);
    if (context.business.id !== parsed.data.businessId || context.branch.id !== parsed.data.branchId) throw new BusinessAccessError("Bu rapor kapsamına erişimin yok.", 403);
    return reply(await readBusinessReport(context, {
      days: Number(parsed.data.days) as ReportDays, allBranches: parsed.data.allBranches === "true",
      dimension: parsed.data.dimension, offset: Number(parsed.data.offset),
    }, request.signal));
  } catch (error) {
    return reply({ error: error instanceof BusinessAccessError ? error.message : "Rapor alınamadı. Daha sonra yeniden dene." }, error instanceof BusinessAccessError ? error.status : 503);
  }
}
