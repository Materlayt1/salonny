import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { apiRateLimit, readBoundedJson } from "@/lib/api-security";
import { createRequestClientOptional } from "@/lib/supabase/request";
import { BusinessAccessError, getBusinessRequestContext, requirePanelPermission } from "@/lib/business-request-context";
import { setupInput, setupQuery, setupState, setupStartResult, setupSavedResult, setupReviewResult } from "@/lib/business-setup-contract";
import { prepareBusinessImage } from "@/lib/business-image";
import type { BusinessContext } from "@/lib/business-context";

const reply = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
const failed = (error: unknown) => reply({ error: error instanceof BusinessAccessError ? error.message : "İşletme kurulumu tamamlanamadı. Taslağını koruyup yeniden dene." }, error instanceof BusinessAccessError ? error.status : 503);
function parameters(request: Request) {
  const search = new URL(request.url).searchParams; const keys = [...search.keys()];
  const parsed = setupQuery.safeParse(Object.fromEntries(search));
  if (!parsed.success || new Set(keys).size !== keys.length) throw new BusinessAccessError("İşletme, şube ve görsel sayfasını kontrol et.", 422);
  return parsed.data;
}
async function actor(request: Request) {
  const client = await createRequestClientOptional(request);
  const user = client ? (await client.auth.getUser()).data.user : null;
  if (!client || !user) throw new BusinessAccessError("Giriş yapmalısın.", 401);
  return { client, user };
}
function rpcFailure(error: { code?: string; message?: string }) {
  if (error.code === "42501") throw new BusinessAccessError("Bu işletme kurulumu için yetkin yok.", 403);
  if (error.code === "PGRST202") throw new BusinessAccessError("Native işletme kurulum altyapısı henüz etkin değil.", 503);
  if (["40001", "23505"].includes(error.code ?? "")) throw new BusinessAccessError("Kayıt başka bir işlemde değişmiş veya işlem kimliği kullanılmış. Güncel kaydı yeniden yükle.", 409);
  if ((error.message ?? "").includes("SETUP_LOCATION_AMBIGUOUS")) throw new BusinessAccessError("Şubede birden fazla konum var. Yanlış adresi değiştirmemek için düzenleme kapalı.", 409);
  if ((error.message ?? "").includes("SETUP_IMAGE_LIMIT")) throw new BusinessAccessError("İşletmede en fazla 50 görsel desteklenir.", 409);
  if (["22023", "22P02", "23514", "23503"].includes(error.code ?? "")) throw new BusinessAccessError("Profil, konum veya görsel bilgilerini kontrol et.", 422);
  throw new BusinessAccessError("Kurulum servisine ulaşılamadı. Daha sonra yeniden dene.", 503);
}
async function ready(client: BusinessContext["supabase"], businessId?: string) {
  const result = await client.rpc("native_business_setup_ready", { p_business_id: businessId ?? null });
  if (result.error) rpcFailure(result.error);
  if (result.data !== true) throw new BusinessAccessError("Bu kurulum için sahip veya yönetici yetkisi gerekiyor.", 403);
}
async function context(request: Request, selected: ReturnType<typeof parameters>): Promise<BusinessContext | null> {
  if (selected.businessId) {
    const result = await getBusinessRequestContext(request);
    if (result.business.id !== selected.businessId || result.branch.id !== selected.branchId) throw new BusinessAccessError("Bu işletme ve şube kapsamına erişimin yok.", 403);
    requirePanelPermission(result, "settings", true); return result;
  }
  const { client, user } = await actor(request); await ready(client);
  const membership = await client.from("business_members").select("business_id").eq("user_id", user.id).eq("active", true).eq("role", "OWNER").order("created_at").limit(1).maybeSingle();
  if (membership.error) throw membership.error;
  if (!membership.data) return null;
  const branch = await client.from("branches").select("id").eq("business_id", membership.data.business_id).eq("active", true).order("is_primary", { ascending: false }).order("created_at").limit(1).maybeSingle();
  if (branch.error || !branch.data) throw new BusinessAccessError("İşletmenin aktif şubesi bulunamadı.", 409);
  const url = new URL(request.url); url.searchParams.set("businessId", membership.data.business_id); url.searchParams.set("branchId", branch.data.id);
  return getBusinessRequestContext(new Request(url, { headers: request.headers, signal: request.signal }));
}

export async function GET(request: Request) {
  try {
    const selected = parameters(request);
    const limited = await apiRateLimit(request, "business-setup-read", 60, 60_000, { critical: true }); if (limited) return limited;
    const current = await context(request, selected); const { client } = current ? { client: current.supabase } : await actor(request);
    await ready(client, current?.business.id);
    const categories = await client.from("business_categories").select("id,name_tr").eq("active", true).order("sort_order").order("id").limit(200);
    if (categories.error) throw categories.error;
    const basic = { categories: (categories.data ?? []).map((row) => ({ id: row.id, name: row.name_tr })), imageOffset: Number(selected.imageOffset) };
    if (!current) return reply(setupState.parse({ ...basic, business: null, location: null, timezone: "Europe/Istanbul", images: [], totalImages: 0, hasMoreImages: false, coverIds: [], readiness: { openDays: 0, activeServices: 0, activeEmployees: 0, settingsPresent: false } }));
    requirePanelPermission(current, "settings", true);
    const { business, branch } = current;
    const [profile, location, images, covers, hours, services, employees, settings] = await Promise.all([
      client.from("businesses").select("id,name,slug,status,description,phone,email,whatsapp_phone,website_url,category_id,updated_at").eq("id", business.id).maybeSingle(),
      client.from("business_locations").select("id,address_line,district,city,postal_code,latitude,longitude").eq("business_id", business.id).eq("branch_id", branch.id).limit(2),
      client.from("business_images").select("id,storage_path,kind,alt_text,native_content_sha256", { count: "exact" }).eq("business_id", business.id).order("sort_order").order("id").range(basic.imageOffset, basic.imageOffset + 24),
      client.from("business_images").select("id").eq("business_id", business.id).eq("kind", "cover").order("id").limit(51),
      client.from("business_hours").select("weekday").eq("business_id", business.id).eq("branch_id", branch.id).eq("is_closed", false).limit(100),
      client.from("services").select("id", { count: "exact", head: true }).eq("business_id", business.id).eq("active", true),
      client.from("employees").select("id", { count: "exact", head: true }).eq("business_id", business.id).eq("active", true),
      client.from("business_settings").select("business_id").eq("business_id", business.id).maybeSingle(),
    ]);
    if ([profile, location, images, covers, hours, services, employees, settings].some((result) => result.error) || !profile.data || images.count === null || services.count === null || employees.count === null) throw new Error("Incomplete setup data");
    if ((location.data?.length ?? 0) > 1) throw new BusinessAccessError("Şubede birden fazla konum var. Yönetici incelemesi gerekiyor.", 409);
    const row = profile.data; const address = location.data?.[0];
    const imageRows = (images.data ?? []).map((image) => {
      if (!image.storage_path.startsWith(`business/${business.id}/`) || image.storage_path.includes("..") || image.storage_path.includes("\\")) throw new Error("Invalid asset scope");
      return { id: image.id, url: client.storage.from("business-assets").getPublicUrl(image.storage_path).data.publicUrl, kind: image.kind, altText: (image.alt_text ?? business.name).slice(0, 160), contentHash: image.native_content_sha256 };
    });
    return reply(setupState.parse({ ...basic, business: { id: row.id, branchId: branch.id, branchName: branch.name, slug: row.slug, role: current.role, status: row.status, revision: row.updated_at, profile: { name: row.name, description: row.description ?? "", phone: row.phone ?? "", email: row.email ?? "", whatsappPhone: row.whatsapp_phone ?? "", websiteUrl: row.website_url ?? "", categoryId: row.category_id } }, location: address ? { id: address.id, addressLine: address.address_line, district: address.district, city: address.city, postalCode: address.postal_code ?? "", latitude: Number(address.latitude), longitude: Number(address.longitude) } : null, timezone: business.timezone, images: imageRows, totalImages: images.count, hasMoreImages: basic.imageOffset + imageRows.length < images.count, coverIds: (covers.data ?? []).map((item) => item.id), readiness: { openDays: new Set((hours.data ?? []).map((item) => item.weekday)).size, activeServices: services.count, activeEmployees: employees.count, settingsPresent: Boolean(settings.data) } }));
  } catch (error) { return failed(error); }
}

export async function POST(request: Request) {
  try {
    const selected = parameters(request);
    const limited = await apiRateLimit(request, "business-setup-write", 12, 60_000, { critical: true }); if (limited) return limited;
    const { client } = await actor(request);
    const body = await readBoundedJson(request, 2_900_000); if (!body.ok) return body.response;
    const parsed = setupInput.safeParse(body.value); if (!parsed.success) return reply({ error: "İşletme, konum ve görsel bilgilerini kontrol et." }, 422);
    const values = parsed.data;
    if (values.action === "start") {
      if (selected.businessId) throw new BusinessAccessError("Mevcut işletmeni düzenlemek için profil adımını kullan.", 422);
      await ready(client);
      const result = await client.rpc("native_start_business_setup", { p_name: values.name, p_description: values.description });
      if (result.error) rpcFailure(result.error);
      return reply(setupStartResult.parse(result.data));
    }
    if (!selected.businessId || !selected.branchId) throw new BusinessAccessError("İşletme ve şubeyi açıkça seçmelisin.", 422);
    const current = await context(request, selected);
    if (!current) throw new BusinessAccessError("İşletme bulunamadı.", 403);
    await ready(current.supabase, current.business.id);
    let response;
    if (values.action === "submit") {
      if (current.role !== "OWNER") throw new BusinessAccessError("İncelemeye yalnız işletme sahibi gönderebilir.", 403);
      response = await current.supabase.rpc("native_submit_business_setup", { p_business_id: current.business.id });
      if (response.error) rpcFailure(response.error);
      const result = setupReviewResult.parse(response.data);
      revalidatePath("/business/onboarding"); return reply(result);
    }
    let data: unknown; let expected: unknown = null;
    if (values.action === "profile") data = { ...values.profile, revision: values.expectedRevision };
    else if (values.action === "location") { data = values.location; expected = values.expected; }
    else if (values.action === "cover") { data = { id: values.id }; expected = [...values.expectedCoverIds].sort(); }
    else {
      const path = `business/${current.business.id}/native-${values.id}.jpg`;
      const existing = await current.supabase.from("business_images").select("id,business_id,branch_id,storage_path,native_content_sha256,alt_text").eq("id", values.id).maybeSingle();
      if (existing.error) throw existing.error;
      if (!existing.data) {
        // Reject an already-full gallery before consuming CPU or uploading an
        // unlinked object. SQL still enforces the limit under its row lock.
        const capacity = await current.supabase.from("business_images").select("id", { count: "exact", head: true }).eq("business_id", current.business.id);
        if (capacity.error || typeof capacity.count !== "number" || !Number.isInteger(capacity.count) || capacity.count < 0) throw new BusinessAccessError("Görsel sınırı doğrulanamadı. Aynı seçimi koruyup yeniden dene.", 503);
        if (capacity.count >= 50) throw new BusinessAccessError("İşletmede en fazla 50 görsel desteklenir.", 409);
      }
      const prepared = await prepareBusinessImage(values.base64);
      if (existing.data && (existing.data.business_id !== current.business.id || existing.data.branch_id !== current.branch.id || existing.data.storage_path !== path || existing.data.native_content_sha256 !== prepared.hash || existing.data.alt_text !== values.altText)) throw new BusinessAccessError("Görsel işlem kimliği başka içerikte kullanılmış. Yeni bir görsel seç.", 409);
      if (!existing.data) {
        const upload = await current.supabase.storage.from("business-assets").upload(path, prepared.bytes, { contentType: "image/jpeg", upsert: false });
        // An ambiguous prior upload may leave the exact same path unlinked.
        // Read it back and compare bytes; never overwrite an unknown object.
        if (upload.error) {
          const previous = await current.supabase.storage.from("business-assets").download(path);
          if (previous.error || !previous.data || previous.data.size !== prepared.bytes.length || !Buffer.from(await previous.data.arrayBuffer()).equals(prepared.bytes)) throw new BusinessAccessError("Görsel yüklenemedi. Aynı seçimi koruyup yeniden dene.", 503);
        }
      }
      data = { id: values.id, altText: values.altText, contentHash: prepared.hash };
    }
    response = await current.supabase.rpc("native_save_business_setup", { p_business_id: current.business.id, p_branch_id: current.branch.id, p_action: values.action, p_data: data, p_expected: expected });
    if (response.error) rpcFailure(response.error);
    const saved = setupSavedResult.parse(response.data);
    // Storage and PostgreSQL cannot share a transaction. Failed metadata writes
    // retain the exact owned object for retry; no unsafe speculative deletion.
    revalidatePath("/business/onboarding"); revalidatePath(`/business/${current.business.slug}`); revalidatePath(`/booking/${current.business.slug}`); revalidateTag("marketplace", "max");
    return reply(saved);
  } catch (error) { return failed(error); }
}
