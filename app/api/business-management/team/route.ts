import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { apiRateLimit, readBoundedJson } from "@/lib/api-security";
import { BusinessAccessError, getBusinessRequestContext, requirePanelPermission } from "@/lib/business-request-context";
import type { BusinessContext } from "@/lib/business-context";

const uuid = z.string().uuid();
const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const period = z.object({ weekday: z.number().int().min(0).max(6), startsAt: time, endsAt: time }).strict().refine((row) => row.startsAt < row.endsAt);
const input = z.discriminatedUnion("action", [
  z.object({ action: z.literal("schedule"), employeeId: uuid, periods: z.array(period).max(7).refine((rows) => new Set(rows.map((row) => row.weekday)).size === rows.length) }).strict(),
  z.object({ action: z.literal("service"), employeeId: uuid, serviceId: uuid, assigned: z.boolean() }).strict(),
  z.object({ action: z.literal("timeOff"), employeeId: uuid, startsAt: z.iso.datetime({ offset: true }), endsAt: z.iso.datetime({ offset: true }), kind: z.enum(["leave", "vacation", "blocked", "break"]), note: z.string().trim().max(1000).default("") }).strict().refine((row) => Date.parse(row.endsAt) > Date.parse(row.startsAt) && Date.parse(row.endsAt) - Date.parse(row.startsAt) <= 366 * 86_400_000),
  z.object({ action: z.literal("removeTimeOff"), employeeId: uuid, id: uuid }).strict(),
]);
const reply = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
const failed = (error: unknown) => reply({ error: error instanceof BusinessAccessError ? error.message : "Çalışan araçlarına ulaşılamadı. Yeniden dene." }, error instanceof BusinessAccessError ? error.status : 503);
async function scopedEmployee(context: BusinessContext, employeeId: string) {
  const employee = await context.supabase.from("employees").select("id,display_name,employee_branches!inner(branch_id)").eq("id", employeeId).eq("business_id", context.business.id).eq("employee_branches.branch_id", context.branch.id).maybeSingle();
  if (employee.error) throw employee.error;
  if (!employee.data) throw new BusinessAccessError("Çalışan seçili işletme ve şubede bulunamadı.", 404);
  return employee.data;
}

export async function GET(request: Request) {
  try {
    const search = new URL(request.url).searchParams;
    const employeeId = uuid.safeParse(search.get("employeeId"));
    const offset = Number(search.get("offset") ?? 0);
    if (!employeeId.success || !Number.isInteger(offset) || offset < 0 || offset > 100_000) return reply({ error: "Geçersiz çalışan veya sayfa." }, 422);
    const limited = await apiRateLimit(request, "business-team-read", 120, 60_000); if (limited) return limited;
    const context = await getBusinessRequestContext(request);
    // Availability and skills management is restricted to managers, including reads.
    requirePanelPermission(context, "employees", true);
    const employee = await scopedEmployee(context, employeeId.data);
    const { supabase: client, business, branch } = context;
    const [services, hours, timeOff] = await Promise.all([
      client.from("services").select("id,name,active,employee_services(employee_id)", { count: "exact" }).eq("business_id", business.id).eq("employee_services.employee_id", employee.id).order("name").order("id").range(offset, offset + 49),
      client.from("employee_working_hours").select("weekday,starts_at,ends_at,valid_from,valid_until").eq("business_id", business.id).eq("branch_id", branch.id).eq("employee_id", employee.id).order("weekday").limit(50),
      client.from("employee_time_off").select("id,starts_at,ends_at,kind,note", { count: "exact" }).eq("business_id", business.id).eq("employee_id", employee.id).gte("ends_at", new Date().toISOString()).order("starts_at").order("id").range(offset, offset + 49),
    ]);
    if (services.error || hours.error || timeOff.error) throw new Error("Team query failed");
    return reply({
      employee: { id: employee.id, name: employee.display_name },
      services: (services.data ?? []).map((row) => ({ id: row.id, name: row.name, active: row.active, assigned: Boolean(row.employee_services?.length) })),
      periods: (hours.data ?? []).filter((row) => !row.valid_from && !row.valid_until).map((row) => ({ weekday: row.weekday, startsAt: row.starts_at.slice(0, 5), endsAt: row.ends_at.slice(0, 5) })),
      hasAdvancedSchedule: (hours.data ?? []).length >= 50 || (hours.data ?? []).some((row) => row.valid_from || row.valid_until) || new Set((hours.data ?? []).map((row) => row.weekday)).size !== (hours.data ?? []).length,
      timeOff: (timeOff.data ?? []).map((row) => ({ id: row.id, startsAt: row.starts_at, endsAt: row.ends_at, kind: row.kind, note: row.note ?? "" })),
      hasMore: offset + 50 < Math.max(services.count ?? 0, timeOff.count ?? 0),
    });
  } catch (error) { return failed(error); }
}

export async function POST(request: Request) {
  try {
    const body = await readBoundedJson(request, 8192); if (!body.ok) return body.response;
    const parsed = input.safeParse(body.value); if (!parsed.success) return reply({ error: "Saat, tarih ve çalışan bilgilerini kontrol et." }, 422);
    const limited = await apiRateLimit(request, "business-team-write", 60, 60_000, { critical: true }); if (limited) return limited;
    const context = await getBusinessRequestContext(request);
    requirePanelPermission(context, "employees", true);
    const values = parsed.data;
    await scopedEmployee(context, values.employeeId);
    const { supabase: client, business, branch } = context;
    if (values.action === "schedule") {
      // Existing weekly RPC replaces all periods; don't silently erase dated overrides.
      const existing = await client.from("employee_working_hours").select("weekday,valid_from,valid_until", { count: "exact" }).eq("business_id", business.id).eq("branch_id", branch.id).eq("employee_id", values.employeeId).limit(50);
      if (existing.error) throw existing.error;
      const hours = existing.data ?? [];
      if ((existing.count ?? 0) > 7 || hours.some((row) => row.valid_from || row.valid_until) || new Set(hours.map((row) => row.weekday)).size !== hours.length) throw new BusinessAccessError("Tarihe özel veya çok parçalı vardiyalar var. Önce mevcut planı incele.", 409);
      const result = await client.rpc("save_employee_weekly_schedule", { p_employee_id: values.employeeId, p_branch_id: branch.id, p_schedule: values.periods }); if (result.error) throw result.error;
    } else if (values.action === "service") {
      const service = await client.from("services").select("id,active").eq("id", values.serviceId).eq("business_id", business.id).maybeSingle();
      if (service.error) throw service.error;
      if (!service.data) throw new BusinessAccessError("Hizmet bu işletmede bulunamadı.", 404);
      if (values.assigned && !service.data.active) throw new BusinessAccessError("Pasif hizmet çalışana atanamaz.", 409);
      // One atomic link change, preserving other skills and existing price overrides.
      const result = values.assigned
        ? await client.from("employee_services").upsert({ employee_id: values.employeeId, service_id: values.serviceId }, { onConflict: "employee_id,service_id", ignoreDuplicates: true })
        : await client.from("employee_services").delete().eq("employee_id", values.employeeId).eq("service_id", values.serviceId);
      if (result.error) throw result.error;
    } else if (values.action === "timeOff") {
      const result = await client.rpc("add_employee_time_off", { p_employee_id: values.employeeId, p_starts_at: values.startsAt, p_ends_at: values.endsAt, p_kind: values.kind, p_note: values.note || null }); if (result.error) throw result.error;
    } else {
      const record = await client.from("employee_time_off").select("id").eq("id", values.id).eq("employee_id", values.employeeId).eq("business_id", business.id).maybeSingle();
      if (record.error) throw record.error;
      if (!record.data) throw new BusinessAccessError("İzin kaydı bulunamadı.", 404);
      const result = await client.rpc("delete_employee_time_off", { p_time_off_id: values.id }); if (result.error) throw result.error;
    }
    revalidatePath("/business/employees"); revalidatePath("/business/calendar"); revalidatePath(`/booking/${business.slug}`); revalidateTag("marketplace", "max");
    return reply({ saved: true });
  } catch (error) { return failed(error); }
}
