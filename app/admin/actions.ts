"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createServerClientOptional } from "@/lib/supabase/server";

const idSchema = z.string().uuid();
const businessActionSchema = z.enum(["approve", "suspend", "return_review", "verify", "unverify"]);
const reviewStatusSchema = z.enum(["approved", "rejected", "flagged"]);
const roleSchema = z.enum(["CUSTOMER", "BUSINESS_OWNER", "BUSINESS_MANAGER", "EMPLOYEE", "ADMIN"]);
const categorySchema = z.object({
  id: z.union([z.string().uuid(), z.literal("")]).optional(),
  name: z.string().trim().min(2).max(80),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80),
  icon: z.string().trim().max(40).optional().default(""),
  sortOrder: z.coerce.number().int().min(0).max(10_000),
  active: z.boolean(),
});

async function requireAdminClient() {
  const supabase = await createServerClientOptional();
  if (!supabase) throw new Error("Supabase yapılandırması bulunamadı.");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");
  const { data } = await supabase.from("users").select("role").eq("id", user.id).maybeSingle();
  if (data?.role !== "ADMIN") throw new Error("Bu işlem için yönetici yetkisi gerekiyor.");
  return supabase;
}

export async function reviewBusiness(formData: FormData) {
  const businessId = idSchema.parse(formData.get("business_id"));
  const action = businessActionSchema.parse(formData.get("action"));
  const supabase = await requireAdminClient();
  const { error } = await supabase.rpc("admin_review_business", { p_business_id: businessId, p_action: action });
  if (error) throw new Error("İşletme durumu güncellenemedi.");
  revalidatePath("/admin");
  revalidatePath("/");
  revalidatePath("/kesfet");
  revalidateTag("marketplace", "max");
}

export async function moderateReview(formData: FormData) {
  const reviewId = idSchema.parse(formData.get("review_id"));
  const status = reviewStatusSchema.parse(formData.get("status"));
  const supabase = await requireAdminClient();
  const { error } = await supabase.rpc("admin_moderate_review", { p_review_id: reviewId, p_status: status });
  if (error) throw new Error("Yorum moderasyonu kaydedilemedi.");
  revalidatePath("/admin");
  revalidateTag("marketplace", "max");
}

export async function setCategoryActive(formData: FormData) {
  const categoryId = idSchema.parse(formData.get("category_id"));
  const active = z.enum(["true", "false"]).parse(formData.get("active")) === "true";
  const supabase = await requireAdminClient();
  const { error } = await supabase.rpc("admin_set_category_active", { p_category_id: categoryId, p_active: active });
  if (error) throw new Error("Kategori durumu güncellenemedi.");
  revalidatePath("/admin");
  revalidatePath("/");
  revalidateTag("categories", "max");
}

export async function saveCategory(formData: FormData) {
  const values = categorySchema.parse({
    id: String(formData.get("category_id") ?? ""),
    name: formData.get("name"),
    slug: formData.get("slug"),
    icon: formData.get("icon"),
    sortOrder: formData.get("sort_order"),
    active: formData.get("active") === "on",
  });
  const supabase = await requireAdminClient();
  const { error } = await supabase.rpc("admin_upsert_business_category", {
    p_category_id: values.id || null,
    p_name_tr: values.name,
    p_slug: values.slug,
    p_icon: values.icon,
    p_sort_order: values.sortOrder,
    p_active: values.active,
  });
  if (error) {
    if (error.code === "23505") throw new Error("Bu kategori adı veya slug zaten kullanılıyor.");
    throw new Error("Kategori kaydedilemedi.");
  }
  revalidatePath("/admin");
  revalidatePath("/");
  revalidatePath("/kesfet");
  revalidateTag("categories", "max");
  revalidateTag("marketplace", "max");
}

export async function setUserRole(formData: FormData) {
  const userId = idSchema.parse(formData.get("user_id"));
  const role = roleSchema.parse(formData.get("role"));
  const supabase = await requireAdminClient();
  const { error } = await supabase.rpc("admin_set_user_role", { p_user_id: userId, p_role: role });
  if (error) throw new Error("Kullanıcı rolü güncellenemedi.");
  revalidatePath("/admin");
}
