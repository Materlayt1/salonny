import { NextResponse } from "next/server";
import { apiRateLimit, readBoundedJson } from "@/lib/api-security";
import { BusinessAccessError, getBusinessRequestContext, requirePanelPermission } from "@/lib/business-request-context";
import { customerCareProfileInput, customerCareQuery, customerCareSchema, customerCareWriteResult, validateCareMediaPath } from "@/lib/customer-care-contract";

const reply = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
const failed = (error: unknown) => reply({ error: error instanceof BusinessAccessError ? error.message : "Müşteri bakım kaydı alınamadı. Yeniden dene." }, error instanceof BusinessAccessError ? error.status : 503);
function rpcFailure(error: { code?: string }) {
  if (error.code === "42501") return new BusinessAccessError("Bu müşteri kaydını görme veya değiştirme yetkin yok.", 403);
  if (error.code === "P0002") return new BusinessAccessError("Müşteri seçili işletmede bulunamadı.", 404);
  if (error.code === "40001") return new BusinessAccessError("Bakım kaydı başka bir işlemde değişti. Güncel kaydı yükle.", 409);
  if (error.code === "22023") return new BusinessAccessError("Bakım bilgilerini kontrol et.", 422);
  if (error.code === "PGRST202" || error.code === "42883") return new BusinessAccessError("Müşteri bakım altyapısı henüz etkin değil. İşletme yöneticine bildir.", 503);
  return new BusinessAccessError("Bakım kaydı doğrulanamadı. Yeniden dene.", 503);
}
function parameters(request: Request) {
  const params = new URL(request.url).searchParams;
  const keys = [...params.keys()];
  const query = customerCareQuery.safeParse(Object.fromEntries(params));
  if (!query.success || new Set(keys).size !== keys.length) throw new BusinessAccessError("Müşteri, işletme, şube ve sayfayı kontrol et.", 422);
  return query.data;
}
async function contextFor(request: Request, write: boolean) {
  const query = parameters(request);
  const context = await getBusinessRequestContext(request);
  requirePanelPermission(context, "customers", write);
  if (context.business.id !== query.businessId || context.branch.id !== query.branchId) throw new BusinessAccessError("Bu müşteri kapsamına erişimin yok.", 403);
  return { query, context };
}

export async function GET(request: Request) {
  try {
    const query = parameters(request);
    const limited = await apiRateLimit(request, "business-customer-care-read", 60, 60_000, { critical: true });
    if (limited) { limited.headers.set("Cache-Control", "private, no-store"); return limited; }
    const { context } = await contextFor(request, false);
    if (query.tab === "loyalty" && !context.financialVisibility) throw new BusinessAccessError("Sadakat hareketlerini görmek için finansal görünürlük gerekiyor.", 403);
    const result = await context.supabase.rpc("native_customer_care", {
      p_business_id: context.business.id, p_branch_id: context.branch.id, p_customer_id: query.customerId, p_tab: query.tab, p_offset: Number(query.offset),
    }).abortSignal(AbortSignal.any([request.signal, AbortSignal.timeout(10_000)]));
    if (result.error) throw rpcFailure(result.error);
    const parsed = customerCareSchema.safeParse(result.data);
    if (!parsed.success || parsed.data.scope.businessId !== query.businessId || parsed.data.scope.branchId !== query.branchId || parsed.data.scope.customerId !== query.customerId
      || parsed.data.scope.financialVisible !== context.financialVisibility || parsed.data.scope.canWrite !== ["OWNER", "MANAGER"].includes(context.role)
      || (context.role === "EMPLOYEE") !== (parsed.data.scope.employeeId !== null) || parsed.data.page.tab !== query.tab || parsed.data.page.offset !== Number(query.offset))
      throw new BusinessAccessError("Müşteri kaydı doğrulanamadı. Yeniden dene.", 503);
    if (query.tab === "media") {
      const paths = parsed.data.page.rows.flatMap((row) => row.type === "media" && validateCareMediaPath(row.storagePath, query.businessId, query.customerId) ? [row.storagePath] : []);
      // Validate every tenant/customer path BEFORE signing. A partial signing
      // failure is an error, never an apparently missing private photograph.
      const signed = paths.length ? await context.supabase.storage.from("customer-care-assets").createSignedUrls(paths, 300) : { data: [], error: null };
      if (signed.error || signed.data?.length !== paths.length || signed.data.some((item) => item.error || !item.signedUrl || !paths.includes(item.path ?? "")) || new Set(signed.data.map((item) => item.path)).size !== paths.length) throw new BusinessAccessError("Özel bakım görselleri yüklenemedi. Yeniden dene.", 503);
      const urls = new Map((signed.data ?? []).map((item) => [item.path, item.signedUrl]));
      parsed.data.page.rows = parsed.data.page.rows.map((row) => row.type === "media" ? { ...row, url: urls.get(row.storagePath) ?? null } : row);
    }
    return reply(parsed.data);
  } catch (error) { return failed(error); }
}

export async function POST(request: Request) {
  try {
    const { query, context } = await contextFor(request, true);
    if (query.tab !== "appointments" || query.offset !== "0") return reply({ error: "Kayıt için varsayılan müşteri kapsamını kullan." }, 422);
    const limited = await apiRateLimit(request, "business-customer-care-write", 20, 60_000, { critical: true });
    if (limited) { limited.headers.set("Cache-Control", "private, no-store"); return limited; }
    const bounded = await readBoundedJson(request, 100_000);
    if (!bounded.ok) { bounded.response.headers.set("Cache-Control", "private, no-store"); return bounded.response; }
    const body = customerCareProfileInput.safeParse(bounded.value);
    if (!body.success || body.data.customerId !== query.customerId) return reply({ error: "Bakım alanlarını ve müşteri kimliğini kontrol et." }, 422);
    const value = body.data;
    const result = await context.supabase.rpc("save_customer_care_atomic", {
      p_business_id: context.business.id, p_customer_id: value.customerId, p_expected_version: value.expectedVersion, p_allergies: value.allergies,
      p_anamnesis: value.anamnesis, p_treatment_notes: value.treatmentNotes, p_consent_status: value.consentStatus, p_consent_version: value.consentVersion,
    }).abortSignal(AbortSignal.any([request.signal, AbortSignal.timeout(10_000)]));
    if (result.error) throw rpcFailure(result.error);
    const parsed = customerCareWriteResult.safeParse(result.data);
    if (!parsed.success || parsed.data.customerId !== query.customerId) throw new BusinessAccessError("Kayıt sonucu doğrulanamadı. Güncel kaydı yükle.", 503);
    return reply(parsed.data);
  } catch (error) { return failed(error); }
}
