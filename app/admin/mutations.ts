"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { requireAdminSession } from "@/lib/admin-access";
import { assertRateLimit } from "@/lib/rate-limit";
import type { AdminMutationState } from "@/lib/admin-mutation-types";
import { invalidateMarketplace } from "@/lib/marketplace-invalidation";

const id = z.uuid();
const mutations = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("business"), id, action: z.enum(["approve", "suspend", "return_review", "verify", "unverify"]), expected: z.string().max(120) }).strict(),
  z.object({ kind: z.literal("user"), id, role: z.enum(["CUSTOMER", "BUSINESS_OWNER", "BUSINESS_MANAGER", "EMPLOYEE"]), expected: z.string().max(120) }).strict(),
  z.object({ kind: z.literal("review"), id, status: z.enum(["approved", "rejected", "flagged"]), expected: z.string().max(120) }).strict(),
  z.object({ kind: z.literal("category"), id: z.union([id, z.literal("")]), name: z.string().trim().min(2).max(80), slug: z.string().trim().max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/), icon: z.string().trim().max(40), sort_order: z.coerce.number().int().min(0).max(10000), active: z.boolean() }).strict(),
]);

export async function performAdminMutation(_previous: AdminMutationState, form: FormData): Promise<AdminMutationState> {
  // Authorization is repeated here; neither SSR nor a selected record grants access.
  const { client, user } = await requireAdminSession();
  const entries = [...form].filter(([key]) => !key.startsWith("$ACTION_"));
  if (entries.length > 12 || new Set(entries.map(([key]) => key)).size !== entries.length || entries.some(([,value]) => typeof value !== "string" || value.length > 1000)) return { ok: false, message: "İşlem alanları geçersiz." };
  const raw = Object.fromEntries(entries);
  if (raw.kind === "category" && raw.active !== "true" && raw.active !== "false") return { ok: false, message: "Kategori yayın durumu geçersiz. İşlem gönderilmedi." };
  const parsed = mutations.safeParse({ ...raw, ...(raw.kind === "category" ? { active: raw.active === "true" } : {}) });
  if (!parsed.success) return { ok: false, message: "Alanları kontrol et. İşlem gönderilmedi." };
  const input = parsed.data;
  if (input.kind === "user" && input.id === user.id) return { ok: false, message: "Kendi yönetici rolünü bu ekrandan değiştiremezsin." };
  try {
    await assertRateLimit(`admin-action:${user.id}`, 60, 60_000, { failClosed: true });
    if (input.kind !== "category") {
      const table = input.kind === "business" ? "businesses" : input.kind === "user" ? "users" : "reviews";
      const fields = input.kind === "business" ? "status,verified_at" : input.kind === "user" ? "role,deleted_at" : "moderation_status";
      const current = await client.from(table).select(fields).eq("id", input.id).maybeSingle();
      if (current.error) throw current.error;
      if (!current.data) return { ok: false, message: "Kayıt bulunamadı. Listeyi yenile." };
      const row = current.data as unknown as Record<string, unknown>;
      if (input.kind === "user" && row.deleted_at) return { ok: false, message: "Silinmiş hesabın rolü değiştirilemez." };
      if (input.kind === "user" && row.role === "ADMIN") return { ok: false, message: "Platform yöneticisi hesaplarının yetkileri bu ekrandan değiştirilemez." };
      const snapshot = input.kind === "business" ? `${row.status}|${row.verified_at ?? ""}` : input.kind === "user" ? String(row.role) : String(row.moderation_status);
      if (input.expected !== snapshot) return { ok: false, message: "Kayıt sen bakarken değişmiş. İşlem gönderilmedi; sayfayı yenileyip yeniden incele." };
    }
    const result = input.kind === "business"
      ? await client.rpc("admin_review_business", { p_business_id: input.id, p_action: input.action })
      : input.kind === "user"
        ? await client.rpc("admin_set_user_role", { p_user_id: input.id, p_role: input.role })
        : input.kind === "review"
          ? await client.rpc("admin_moderate_review", { p_review_id: input.id, p_status: input.status })
          : await client.rpc("admin_upsert_business_category", { p_category_id: input.id || null, p_name_tr: input.name, p_slug: input.slug, p_icon: input.icon, p_sort_order: input.sort_order, p_active: input.active });
    if (result.error?.code === "23505") return { ok: false, message: "Bu kategori adı veya kısa adres zaten kullanılıyor." };
    if (result.error?.code === "42501") return { ok: false, message: "Bu işlem için yönetici yetkin doğrulanamadı." };
    if (result.error?.message?.includes("business_owner_unavailable")) return { ok: false, message: "İşletme sahibinin silme talebi var veya hesabı artık etkin değil. Bu işletme yayımlanamaz/doğrulanamaz; işletme kaydı ve geçmişi korunur." };
    if (result.error?.code === "40001") return { ok: false, message: "Hesap/işletme üzerinde başka bir işlem sürüyor. Sonuç kaydedilmedi; listeyi yenileyip yeniden incele." };
    if (result.error) throw result.error;
    const acknowledgement = input.kind === "category"
      ? id.safeParse(result.data).success && (!input.id || result.data === input.id)
      : input.kind === "business"
        ? z.object({ id: z.literal(input.id), status: z.enum(["draft", "pending_review", "published", "suspended"]), verified_at: z.string().nullable() }).safeParse(result.data).success
        : input.kind === "user"
          ? z.object({ id: z.literal(input.id), role: z.literal(input.role) }).safeParse(result.data).success
          : z.object({ id: z.literal(input.id), moderation_status: z.literal(input.status) }).safeParse(result.data).success;
    if (!acknowledgement) throw new Error("Unverified mutation acknowledgement");
    revalidatePath("/admin");
    if (input.kind !== "user") {
      invalidateMarketplace();
      if (input.kind === "category") revalidateTag("categories", "max");
    }
    return { ok: true, message: input.kind === "category" ? "Kategori kaydedildi. Listeyi yenileyerek güncel kaydı inceleyebilirsin." : "Değişiklik kaydedildi. İşlem geçmişini ilgili kayıt üzerinden açabilirsin." };
  } catch {
    return { ok: false, message: "İşlem sonucu doğrulanamadı. Aynı işlemi tekrarlamadan önce sayfayı yenileyip güncel durumu ve işlem geçmişini kontrol et." };
  }
}
