import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { apiRateLimit, readBoundedJson } from "@/lib/api-security";
import { BusinessAccessError, getBusinessRequestContext, requirePanelPermission } from "@/lib/business-request-context";
import type { BusinessContext } from "@/lib/business-context";

const id = z.string().uuid();
const name = z.string().trim().min(2).max(140);
const audience = z.enum(["all", "new", "loyal", "inactive"]);
const instant = z.iso.datetime({ offset: true }).nullable().default(null);
const input = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"), name, code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,30}$/),
    kind: z.enum(["percentage", "fixed"]), value: z.number().int().positive().max(1_000_000), audience,
    startsAt: instant, endsAt: instant,
  }).strict().refine((row) => row.kind !== "percentage" || row.value <= 100).refine((row) => !row.startsAt || !row.endsAt || Date.parse(row.endsAt) > Date.parse(row.startsAt)),
  // Discount terms span two tables and have no installed atomic edit RPC.
  // This operation intentionally only changes campaign presentation metadata.
  z.object({ action: z.literal("editMetadata"), id, name, audience }).strict(),
]);
const reply = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
function failed(error: unknown) {
  if (error instanceof BusinessAccessError) return reply({ error: error.message }, error.status);
  if (error && typeof error === "object" && "code" in error && error.code === "23505") return reply({ error: "Bu kampanya kodu zaten kullanılıyor. Başka bir kod seç." }, 409);
  return reply({ error: "Kampanya kaydedilemedi. Yeniden dene." }, 503);
}

/** The installed creation RPC selects the earliest OWNER/MANAGER membership. */
async function rpcBusinessMatches(context: BusinessContext) {
  const membership = await context.supabase.from("business_members").select("business_id").eq("user_id", context.user.id).eq("active", true).in("role", ["OWNER", "MANAGER"]).order("created_at").limit(1).maybeSingle();
  if (membership.error) throw membership.error;
  return membership.data?.business_id === context.business.id;
}

async function ownedCampaign(context: BusinessContext, campaignId: string) {
  const result = await context.supabase.from("campaigns").select("id,name,status,audience_filter").eq("id", campaignId).eq("business_id", context.business.id).maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) throw new BusinessAccessError("Kampanya seçili işletmede bulunamadı.", 404);
  return result.data;
}

export async function GET(request: Request) {
  try {
    const rawId = new URL(request.url).searchParams.get("campaignId");
    if (rawId !== null && !id.safeParse(rawId).success) return reply({ error: "Geçersiz kampanya." }, 422);
    const limited = await apiRateLimit(request, "business-campaign-editor-read", 120, 60_000); if (limited) return limited;
    const context = await getBusinessRequestContext(request); requirePanelPermission(context, "campaigns", true);
    if (!rawId) return reply({ createAllowed: await rpcBusinessMatches(context) });
    const campaign = await ownedCampaign(context, rawId);
    const discounts = await context.supabase.from("discounts").select("code,kind,value,starts_at,ends_at").eq("campaign_id", campaign.id).eq("business_id", context.business.id).limit(2);
    if (discounts.error) throw discounts.error;
    const discount = discounts.data?.length === 1 ? discounts.data[0] : null;
    const filter = campaign.audience_filter as Record<string, unknown> | null;
    return reply({ createAllowed: false, campaign: {
      id: campaign.id, name: campaign.name, status: campaign.status, audience: audience.safeParse(filter?.segment).success ? filter!.segment : "all",
      discount: discount ? { code: discount.code ?? "", kind: discount.kind, value: discount.kind === "fixed" ? discount.value / 100 : discount.value, startsAt: discount.starts_at, endsAt: discount.ends_at } : null,
    } });
  } catch (error) { return failed(error); }
}

export async function POST(request: Request) {
  try {
    const body = await readBoundedJson(request, 4096); if (!body.ok) return body.response;
    const parsed = input.safeParse(body.value); if (!parsed.success) return reply({ error: "Kampanya adı, kodu, indirimi ve tarih aralığını kontrol et." }, 422);
    const limited = await apiRateLimit(request, "business-campaign-editor-write", 30, 60_000, { critical: true }); if (limited) return limited;
    const context = await getBusinessRequestContext(request); requirePanelPermission(context, "campaigns", true);
    const values = parsed.data;
    let campaignId: string;
    if (values.action === "create") {
      // Never call this unscoped legacy RPC for a different selected business.
      if (!await rpcBusinessMatches(context)) throw new BusinessAccessError("Mevcut kampanya servisi yalnızca ilk yetkili işletmede oluşturmayı destekliyor. Seçili işletmede yanlış kayıt oluşmaması için işlem durduruldu.", 409);
      const result = await context.supabase.rpc("create_business_campaign", {
        p_name: values.name, p_code: values.code, p_kind: values.kind, p_value: values.kind === "fixed" ? values.value * 100 : values.value,
        p_audience: values.audience, p_starts_at: values.startsAt, p_ends_at: values.endsAt,
      });
      if (result.error) throw result.error;
      if (!id.safeParse(result.data).success) throw new BusinessAccessError("Kampanya kaydı doğrulanamadı. Tekrar oluşturmadan önce kampanya listesini kontrol et.", 503);
      campaignId = result.data as string;
    } else {
      const existing = await ownedCampaign(context, values.id);
      const filter = existing.audience_filter as Record<string, unknown> | null;
      const result = await context.supabase.from("campaigns").update({ name: values.name, audience_filter: { ...filter, segment: values.audience } }).eq("id", existing.id).eq("business_id", context.business.id).eq("name", existing.name).eq("audience_filter", JSON.stringify(existing.audience_filter)).select("id").maybeSingle();
      if (result.error) throw result.error;
      if (!result.data) throw new BusinessAccessError("Kampanya başka bir işlemde değişti. Ekranı kapatıp yeniden açarak güncel kaydı yükle.", 409);
      campaignId = result.data.id;
    }
    revalidatePath("/business/campaigns"); revalidateTag("marketplace", "max");
    return reply({ saved: true, id: campaignId });
  } catch (error) { return failed(error); }
}
