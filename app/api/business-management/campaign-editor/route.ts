import { NextResponse } from "next/server";
import { apiRateLimit, readBoundedJson } from "@/lib/api-security";
import { BusinessAccessError, getBusinessRequestContext, requirePanelPermission } from "@/lib/business-request-context";
import { campaignListSchema, campaignMutationSchema, campaignQuerySchema, managedCampaignSchema } from "@/lib/campaign-management-contract";

const reply = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
function failed(error: unknown) {
  if (error instanceof BusinessAccessError) return reply({ error: error.message }, error.status);
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
  const message = typeof error === "object" && error !== null && "message" in error ? String(error.message) : "";
  if (code === "42501" || code === "28000") return reply({ error: "Kampanya yönetimi için yetkin yok." }, 403);
  if (code === "22023") return reply({ error: "Kampanya bilgileri geçersiz. Alanları kontrol et." }, 422);
  if (message.includes("CAMPAIGN_STALE")) return reply({ error: "Kampanya başka bir işlemle değişti. Listeyi yenileyip yeniden düzenle.", code: "CAMPAIGN_STALE" }, 409);
  if (message.includes("CAMPAIGN_TERMS_LOCKED")) return reply({ error: "Kullanılmış kuponun koşulları değiştirilemez; yalnız isim ve durum güncellenebilir.", code: "CAMPAIGN_TERMS_LOCKED" }, 409);
  if (message.includes("CAMPAIGN_LEGACY_TERMS")) return reply({ error: "Eski kampanyanın kupon bağlantısı incelenmeli; yalnız isim ve durum değiştirilebilir.", code: "CAMPAIGN_LEGACY_TERMS" }, 409);
  if (code === "23505" || message.includes("CAMPAIGN_CODE_USED") || message.includes("CAMPAIGN_REQUEST_CONFLICT")) return reply({ error: "Kupon kodu veya işlem anahtarı daha önce kullanıldı. Yeni bir kodla tekrar dene." }, 409);
  if (message.includes("CAMPAIGN_NOT_FOUND")) return reply({ error: "Kampanya bulunamadı." }, 404);
  return reply({ error: code === "PGRST202" ? "Kampanya düzenleme altyapısı henüz etkin değil." : "Kampanya işlemi tamamlanamadı. Yeniden dene." }, 503);
}
async function contextFor(request: Request) {
  const raw: Record<string, string> = {};
  for (const [key, value] of new URL(request.url).searchParams) {
    if (key in raw) throw new BusinessAccessError("Tekrarlanan filtre geçersiz.", 422);
    raw[key] = value;
  }
  const filters = campaignQuerySchema.safeParse(raw);
  if (!filters.success) throw new BusinessAccessError("Geçersiz işletme veya filtre.", 422);
  const context = await getBusinessRequestContext(request);
  requirePanelPermission(context, "campaigns", true);
  if (context.business.id !== filters.data.businessId || context.branch.id !== filters.data.branchId) throw new BusinessAccessError("Seçili işletme veya şube doğrulanamadı.", 403);
  return { context, filters: filters.data };
}
export async function GET(request: Request) {
  try {
    const limited = await apiRateLimit(request, "campaign-editor-read", 90, 60_000, { critical: true }); if (limited) return limited;
    const { context, filters } = await contextFor(request);
    const result = await context.supabase.rpc("native_business_campaigns", { p_business_id: context.business.id, p_query: filters.q, p_offset: Number(filters.offset) }).abortSignal(AbortSignal.any([request.signal, AbortSignal.timeout(12_000)]));
    if (result.error) throw result.error;
    const data = campaignListSchema.parse(result.data);
    if (data.businessId !== context.business.id || data.offset !== Number(filters.offset)) throw new Error("Campaign scope mismatch");
    return reply(data);
  } catch (error) { return failed(error); }
}
export async function POST(request: Request) {
  try {
    const limited = await apiRateLimit(request, "campaign-editor-write", 30, 60_000, { critical: true }); if (limited) return limited;
    const body = await readBoundedJson(request, 8192); if (!body.ok) return body.response;
    const parsed = campaignMutationSchema.safeParse(body.value); if (!parsed.success) return reply({ error: "Kampanya alanlarını kontrol et." }, 422);
    const { context } = await contextFor(request); const values = parsed.data;
    const terms = values.action === "save" ? values.terms : null;
    const result = await context.supabase.rpc("native_save_business_campaign", {
      p_business_id: context.business.id, p_campaign_id: values.id, p_request_id: values.requestId,
      p_expected_revision: values.revision, p_operation: values.action, p_name: values.name, p_status: values.status,
      p_code: terms?.code ?? null, p_kind: terms?.kind ?? null, p_value: terms?.value ?? null, p_audience: terms?.audience ?? null,
      p_starts_at: terms?.startsAt ?? null, p_ends_at: terms?.endsAt ?? null,
    }).abortSignal(AbortSignal.any([request.signal, AbortSignal.timeout(12_000)]));
    if (result.error) throw result.error;
    const data = managedCampaignSchema.parse(result.data);
    if (data.businessId !== context.business.id || (values.id && data.id !== values.id)) throw new Error("Campaign scope mismatch");
    return reply(data, values.id ? 200 : 201);
  } catch (error) { return failed(error); }
}
