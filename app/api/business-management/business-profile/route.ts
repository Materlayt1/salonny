import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { apiRateLimit, readBoundedJson } from "@/lib/api-security";
import { BusinessAccessError, getBusinessRequestContext, requirePanelPermission } from "@/lib/business-request-context";
import type { BusinessContext } from "@/lib/business-context";

const clock = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const hour = z.object({ weekday: z.number().int().min(0).max(6), opensAt: clock.nullable(), closesAt: clock.nullable(), closed: z.boolean() }).strict().refine((row) => row.closed ? row.opensAt === null && row.closesAt === null : Boolean(row.opensAt && row.closesAt && row.opensAt < row.closesAt));
const phone = z.string().trim().max(30).refine((value) => !value || (/^[+\d\s()-]+$/.test(value) && value.replace(/\D/g, "").length >= 10 && value.replace(/\D/g, "").length <= 15));
const input = z.discriminatedUnion("action", [
  z.object({ action: z.literal("profile"), name: z.string().trim().min(2).max(120), phone, description: z.string().trim().max(4000) }).strict(),
  z.object({ action: z.literal("address"), addressLine: z.string().trim().min(5).max(500), district: z.string().trim().min(2).max(100), city: z.string().trim().min(2).max(100) }).strict(),
  z.object({ action: z.literal("hours"), hours: z.array(hour).length(7).refine((rows) => new Set(rows.map((row) => row.weekday)).size === 7), confirmClosure: z.boolean().default(false) }).strict(),
]);
const reply = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
const failed = (error: unknown) => reply({ error: error instanceof BusinessAccessError ? error.message : "İşletme profili kaydedilemedi veya yüklenemedi. Yeniden dene." }, error instanceof BusinessAccessError ? error.status : 503);

async function readHours(context: BusinessContext) {
  const result = await context.supabase.from("business_hours").select("weekday,opens_at,closes_at,is_closed,valid_from,valid_until", { count: "exact" }).eq("business_id", context.business.id).eq("branch_id", context.branch.id).order("weekday").limit(50);
  if (result.error) throw result.error;
  const rows = result.data ?? [];
  const advanced = (result.count ?? rows.length) > 7 || rows.some((row) => row.valid_from || row.valid_until) || new Set(rows.map((row) => row.weekday)).size !== rows.length;
  return { rows, advanced };
}
async function readLocation(context: BusinessContext) {
  const result = await context.supabase.from("business_locations").select("id,address_line,district,city").eq("business_id", context.business.id).eq("branch_id", context.branch.id).limit(2);
  if (result.error) throw result.error;
  if ((result.data ?? []).length > 1) throw new BusinessAccessError("Bu şubede birden fazla konum var. Yanlış adresi değiştirmemek için konum düzenleme kapalı.", 409);
  return result.data?.[0] ?? null;
}

export async function GET(request: Request) {
  try {
    const limited = await apiRateLimit(request, "business-profile-read", 120, 60_000); if (limited) return limited;
    const context = await getBusinessRequestContext(request);
    requirePanelPermission(context, "settings", true);
    const [profile, location, hours] = await Promise.all([
      context.supabase.from("businesses").select("name,phone,description").eq("id", context.business.id).maybeSingle(),
      readLocation(context), readHours(context),
    ]);
    if (profile.error) throw profile.error;
    if (!profile.data) throw new BusinessAccessError("İşletme bulunamadı.", 404);
    return reply({ profile: { name: profile.data.name, phone: profile.data.phone ?? "", description: profile.data.description ?? "" }, location: location ? { id: location.id, addressLine: location.address_line, district: location.district, city: location.city } : null, hours: hours.rows.map((row) => ({ weekday: row.weekday, opensAt: row.opens_at?.slice(0, 5) ?? null, closesAt: row.closes_at?.slice(0, 5) ?? null, closed: row.is_closed })), hasAdvancedHours: hours.advanced, timezone: context.branch.timezone, branchName: context.branch.name });
  } catch (error) { return failed(error); }
}

export async function POST(request: Request) {
  try {
    const body = await readBoundedJson(request, 20_000); if (!body.ok) return body.response;
    const parsed = input.safeParse(body.value); if (!parsed.success) return reply({ error: "Profil, adres ve saat bilgilerini kontrol et." }, 422);
    const limited = await apiRateLimit(request, "business-profile-write", 30, 60_000, { critical: true }); if (limited) return limited;
    const context = await getBusinessRequestContext(request);
    requirePanelPermission(context, "settings", true);
    const { supabase: client, business, branch } = context;
    const values = parsed.data;
    if (values.action === "profile") {
      const result = await client.from("businesses").update({ name: values.name, phone: values.phone || null, description: values.description || null }).eq("id", business.id).select("id").maybeSingle();
      if (result.error) throw result.error;
      if (!result.data) throw new BusinessAccessError("İşletme güncellenemedi.", 404);
    } else if (values.action === "address") {
      const location = await readLocation(context);
      if (!location) throw new BusinessAccessError("Bu şubede kayıtlı konum yok. Önce harita üzerinde doğrulanmış bir konum eklenmeli.", 409);
      // Text-only correction: retain postal code, coordinates and the selected branch.
      const result = await client.from("business_locations").update({ address_line: values.addressLine, district: values.district, city: values.city }).eq("id", location.id).eq("business_id", business.id).eq("branch_id", branch.id).select("id").maybeSingle();
      if (result.error) throw result.error;
      if (!result.data) throw new BusinessAccessError("Şube adresi güncellenemedi.", 404);
    } else {
      const existing = await readHours(context);
      // This editor deliberately does not erase date-specific or multi-period plans.
      if (existing.advanced) throw new BusinessAccessError("Tarihe özel veya çok parçalı çalışma saatleri var. Önce mevcut planı incele.", 409);
      if (values.hours.every((row) => row.closed) && !values.confirmClosure) throw new BusinessAccessError("Tüm haftanın kapatılması için açık onay gerekiyor.", 409);
      const rows = values.hours.map((row) => ({ business_id: business.id, branch_id: branch.id, weekday: row.weekday, opens_at: row.opensAt, closes_at: row.closesAt, is_closed: row.closed }));
      // Existing unique(branch_id, weekday), one database statement, no delete-then-insert gap.
      const result = await client.from("business_hours").upsert(rows, { onConflict: "branch_id,weekday" }).select("weekday");
      if (result.error) throw result.error;
      if (result.data?.length !== 7) throw new Error("Hours update did not return all weekdays");
    }
    revalidatePath("/business/settings"); revalidatePath("/business/onboarding"); revalidatePath(`/business/${business.slug}`); revalidatePath(`/booking/${business.slug}`); revalidateTag("marketplace", "max");
    return reply({ saved: true });
  } catch (error) { return failed(error); }
}
