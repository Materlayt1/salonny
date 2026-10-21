import "server-only";
import type { BusinessContext } from "@/lib/business-context";
import { BusinessAccessError, requirePanelPermission } from "@/lib/business-request-context";
import { businessReportSchema, type BusinessReport, type ReportDays, type ReportDimension } from "@/lib/business-report-contract";

export type ReportSelection = { days: ReportDays; allBranches: boolean; dimension: ReportDimension; offset: number };

/** Aggregate in PostgreSQL, never from a bounded PostgREST appointment page. */
export async function readBusinessReport(context: BusinessContext, selection: ReportSelection, signal?: AbortSignal): Promise<BusinessReport> {
  requirePanelPermission(context, "reports");
  const timeout = AbortSignal.timeout(12_000);
  const result = await context.supabase.rpc("native_business_report", {
    p_business_id: context.business.id, p_branch_id: context.branch.id,
    p_days: selection.days, p_all_branches: selection.allBranches,
    p_dimension: selection.dimension, p_offset: selection.offset,
  }).abortSignal(signal ? AbortSignal.any([signal, timeout]) : timeout);
  if (result.error) {
    if (result.error.code === "42501") throw new BusinessAccessError("Bu rapora erişim yetkin yok. İşletme yöneticine bildir.", 403);
    if (result.error.code === "PGRST202") throw new BusinessAccessError("Rapor altyapısı henüz etkin değil. Daha sonra yeniden dene.", 503);
    if (result.error.code === "22023") throw new BusinessAccessError("Rapor dönemi veya işletme saat dilimini kontrol et.", 422);
    throw new BusinessAccessError("Rapor güvenilir biçimde hesaplanamadı. Daha sonra yeniden dene.", 503);
  }
  const parsed = businessReportSchema.safeParse(result.data);
  if (!parsed.success) throw new BusinessAccessError("Rapor doğrulanamadı. Daha sonra yeniden dene.", 503);
  const report = parsed.data;
  if (report.scope.businessId !== context.business.id || report.scope.allBranches !== selection.allBranches
    || report.scope.branchId !== (selection.allBranches ? null : context.branch.id)
    || report.period.timezone !== context.business.timezone || report.period.days !== selection.days
    || report.breakdown.dimension !== selection.dimension || report.breakdown.offset !== selection.offset
    || (context.role === "EMPLOYEE") !== (report.scope.employeeId !== null)) {
    throw new BusinessAccessError("Rapor kapsamı doğrulanamadı. Daha sonra yeniden dene.", 503);
  }
  return report;
}
