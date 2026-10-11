import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { apiRateLimit, readBoundedJson } from "@/lib/api-security";
import { BusinessAccessError, getBusinessRequestContext, requirePanelPermission } from "@/lib/business-request-context";
import { employeeScheduleInput, sameSchedulePeriod, schedulePeriodResultSchema, scheduleUuid } from "@/lib/employee-schedule-contract";

const reply = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
const failed = (error: unknown) => reply({ error: error instanceof BusinessAccessError ? error.message : "İleri vardiya işlemi tamamlanamadı. Bilgilerini koruyup yeniden dene." }, error instanceof BusinessAccessError ? error.status : 503);
type Context = Awaited<ReturnType<typeof getBusinessRequestContext>>;
function explicitScope(request: Request) {
  const parameters = new URL(request.url).searchParams;
  return scheduleUuid.safeParse(parameters.get("businessId")).success && scheduleUuid.safeParse(parameters.get("branchId")).success;
}
function pageOffset(value: string | null, size: number) {
  const offset = Number(value ?? "0");
  return /^(0|[1-9]\d*)$/.test(value ?? "0") && Number.isSafeInteger(offset) && offset <= 100_000 && offset % size === 0 ? offset : null;
}
async function ready(context: Context) {
  const result = await context.supabase.rpc("native_staff_schedules_ready", { p_business_id: context.business.id });
  if (result.error) throw new BusinessAccessError("İleri vardiya altyapısı henüz etkin değil. İşletme yöneticine bildir.", 503);
  if (result.data !== true) throw new BusinessAccessError("İleri vardiyalar için işletme sahibi veya yönetici yetkisi gerekiyor.", 403);
}
async function employee(context: Context, id: string) {
  // A tenant-owned employee need not be linked to the current branch to inspect
  // and add a different branch assignment. Period writes are checked again in SQL.
  const result = await context.supabase.from("employees").select("id,display_name,active").eq("business_id", context.business.id).eq("id", id).maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) throw new BusinessAccessError("Çalışan bu işletmede bulunamadı.", 404);
  return result.data;
}
function rpcFailure(error: { message?: string; code?: string }) {
  const message = error.message ?? "";
  const mapping: Array<[string, string, number]> = [
    ["STALE_SCHEDULE", "Plan başka bir işlemde değişti. Listeyi yenileyip güncel kaydı aç.", 409],
    ["SCHEDULE_OVERLAP", "Bu gün, saat ve tarih aralığı mevcut çalışma dönemiyle örtüşüyor.", 409],
    ["BRANCH_NOT_ASSIGNED", "Çalışan seçili şubeye atanmalı. Şube atamasını kontrol et.", 409],
    ["SCHEDULE_IN_USE", "Şube bağlantısı dönem veya devam eden/gelecek aktif randevu nedeniyle kaldırılamaz. Hiçbir kayıt silinmedi.", 409],
    ["NOT_FOUND", "Çalışan, şube veya çalışma dönemi bulunamadı.", 404],
    ["FORBIDDEN", "Bu vardiya işlemi için yetkin yok.", 403],
    ["INVALID_SCHEDULE", "Gün, saat, tarih aralığı ve şube aktifliğini kontrol et.", 422],
  ];
  for (const [marker, text, status] of mapping) if (message.includes(marker)) throw new BusinessAccessError(text, status);
  if (error.code === "42501") throw new BusinessAccessError("Bu işlem için yetkin yok.", 403);
  if (error.code === "23505") throw new BusinessAccessError("İşlem kimliği kullanılmış. Listeyi yenileyerek mevcut kaydı kontrol et.", 409);
  if (["22023", "22P02", "23514", "23503"].includes(error.code ?? "")) throw new BusinessAccessError("Vardiya veya şube bilgilerini kontrol et.", 422);
  if (error.code === "PGRST202") throw new BusinessAccessError("İleri vardiya altyapısı henüz etkin değil. Daha sonra yeniden dene.", 503);
  throw error;
}

export async function GET(request: Request) {
  try {
    if (!explicitScope(request)) return reply({ error: "İşletme ve şubeyi açıkça seçmelisin." }, 422);
    const parameters = new URL(request.url).searchParams;
    const selectedEmployee = scheduleUuid.safeParse(parameters.get("employeeId"));
    const offset = pageOffset(parameters.get("offset"), 25);
    const branchOffset = pageOffset(parameters.get("branchOffset"), 50);
    if (!selectedEmployee.success || offset === null || branchOffset === null) return reply({ error: "Geçersiz çalışan veya sayfa." }, 422);
    const limited = await apiRateLimit(request, "employee-schedule-read", 120, 60_000); if (limited) return limited;
    const context = await getBusinessRequestContext(request, { allowInactiveBranch: true });
    requirePanelPermission(context, "employees", true);
    await ready(context);
    const selected = await employee(context, selectedEmployee.data);
    // Availability and staff booking currently interpret working-hours clocks
    // in the BUSINESS zone. A branch-specific label would silently mislead.
    const timezone = context.business.timezone;
    try { new Intl.DateTimeFormat("tr-TR", { timeZone: timezone }); } catch { throw new BusinessAccessError("İşletmenin saat dilimi geçersiz. İşletme yöneticine bildir.", 503); }
    const [periods, branches, currentLink, currentBranch] = await Promise.all([
      context.supabase.from("employee_working_hours").select("id,weekday,starts_at,ends_at,valid_from,valid_until", { count: "exact" }).eq("business_id", context.business.id).eq("branch_id", context.branch.id).eq("employee_id", selected.id).order("weekday").order("starts_at").order("id").range(offset, offset + 24),
      context.supabase.from("branches").select("id,name,active", { count: "exact" }).eq("business_id", context.business.id).order("name").order("id").range(branchOffset, branchOffset + 49),
      context.supabase.from("employee_branches").select("branch_id").eq("employee_id", selected.id).eq("branch_id", context.branch.id).maybeSingle(),
      context.supabase.from("branches").select("id,name,active").eq("business_id", context.business.id).eq("id", context.branch.id).maybeSingle(),
    ]);
    if (periods.error || branches.error || currentLink.error || currentBranch.error) throw new Error("Schedule query failed");
    if (!currentBranch.data) throw new BusinessAccessError("Şube artık bu işletmede bulunamadı.", 404);
    if (periods.count === null || branches.count === null) throw new Error("Missing schedule counts");
    const branchRows = branches.data ?? [];
    const ids = branchRows.map((row) => row.id);
    const links = ids.length ? await context.supabase.from("employee_branches").select("branch_id").eq("employee_id", selected.id).in("branch_id", ids) : { data: [], error: null };
    if (links.error) throw links.error;
    const assigned = new Set((links.data ?? []).map((row) => row.branch_id));
    const rows = (periods.data ?? []).map((row) => schedulePeriodResultSchema.parse({ id: row.id, weekday: row.weekday, startsAt: row.starts_at, endsAt: row.ends_at, validFrom: row.valid_from, validUntil: row.valid_until }));
    return reply({
      employee: { id: selected.id, name: selected.display_name, active: selected.active }, timezone,
      branch: { id: currentBranch.data.id, name: currentBranch.data.name, active: currentBranch.data.active },
      assigned: Boolean(currentLink.data),
      branches: branchRows.map((row) => ({ id: row.id, name: row.name, active: row.active, assigned: assigned.has(row.id) })),
      totalBranches: branches.count, hasMoreBranches: branchOffset + 50 < branches.count,
      periods: rows, total: periods.count, hasMore: offset + 25 < periods.count,
    });
  } catch (error) { return failed(error); }
}

export async function POST(request: Request) {
  try {
    if (!explicitScope(request)) return reply({ error: "İşletme ve şubeyi açıkça seçmelisin." }, 422);
    const body = await readBoundedJson(request, 12_288); if (!body.ok) return body.response;
    const parsed = employeeScheduleInput.safeParse(body.value);
    if (!parsed.success) return reply({ error: "Gün, saat, gerçek tarih ve çalışma dönemi bilgilerini kontrol et." }, 422);
    const limited = await apiRateLimit(request, "employee-schedule-write", 60, 60_000, { critical: true }); if (limited) return limited;
    const context = await getBusinessRequestContext(request, { allowInactiveBranch: true });
    requirePanelPermission(context, "employees", true);
    await ready(context);
    const values = parsed.data;
    const selected = await employee(context, values.employeeId);
    let result: unknown;
    if (values.action === "setBranch") {
      const target = await context.supabase.from("branches").select("id,active").eq("business_id", context.business.id).eq("id", values.targetBranchId).maybeSingle();
      if (target.error) throw target.error;
      if (!target.data) throw new BusinessAccessError("Hedef şube bu işletmede bulunamadı.", 404);
      // Preserve an existing inactive link on a no-op retry. SQL verifies the
      // expected assignment under its lock; the client cannot invent that link.
      if (values.assigned && !target.data.active && !values.expectedAssigned) throw new BusinessAccessError("Pasif şubeye yeni atama yapılamaz.", 422);
      const response = await context.supabase.rpc("set_employee_branch_assignment", { p_business_id: context.business.id, p_employee_id: selected.id, p_branch_id: target.data.id, p_assigned: values.assigned, p_expected_assigned: values.expectedAssigned });
      if (response.error) rpcFailure(response.error);
      const saved = z.object({ branchId: scheduleUuid, assigned: z.boolean() }).parse(response.data);
      if (saved.branchId !== target.data.id || saved.assigned !== values.assigned) throw new Error("Unexpected branch result");
      result = saved;
    } else {
      if (values.action !== "deletePeriod" && !selected.active) throw new BusinessAccessError("Pasif çalışana yeni veya değiştirilmiş çalışma dönemi kaydedilemez.", 422);
      const action = values.action === "createPeriod" ? "create" : values.action === "updatePeriod" ? "update" : "delete";
      const response = await context.supabase.rpc("manage_employee_schedule_period", { p_business_id: context.business.id, p_branch_id: context.branch.id, p_employee_id: selected.id, p_action: action, p_period_id: values.id, p_expected: values.action === "createPeriod" ? null : values.expected, p_period: values.action === "deletePeriod" ? null : values.period });
      if (response.error) rpcFailure(response.error);
      if (values.action === "deletePeriod") {
        const saved = z.object({ deletedId: scheduleUuid }).parse(response.data);
        if (saved.deletedId !== values.id) throw new Error("Unexpected deleted period");
        result = saved;
      } else {
        const saved = z.object({ period: schedulePeriodResultSchema }).parse(response.data);
        if (saved.period.id !== values.id || !sameSchedulePeriod(saved.period, values.period)) throw new Error("Unexpected saved period");
        result = saved;
      }
    }
    revalidatePath("/business/employees"); revalidatePath("/business/calendar");
    revalidatePath(`/booking/${context.business.slug}`); revalidatePath(`/business/${context.business.slug}`);
    revalidateTag("marketplace", "max");
    return reply({ saved: true, ...(result as Record<string, unknown>) });
  } catch (error) { return failed(error); }
}
