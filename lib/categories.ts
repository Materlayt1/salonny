import "server-only";
import { unstable_cache } from "next/cache";
import { developmentDemoCategories } from "@/lib/demo-marketplace";
import { awaitPublicRequest, createPublicSupabaseClientOptional } from "@/lib/supabase/public";
import type { Category } from "@/lib/types";

const colors: Record<string, string> = { kuafor: "#EEE6FF", berber: "#F2E5FF", guzellik: "#FFE4EF", nail: "#EFE5FF", spa: "#FFEBDD", veteriner: "#DFF7EC", "pet-kuaforu": "#DFF1FF", fitness: "#E2F7F1", pilates: "#E7ECFF", diger: "#F1F1F4" };
const cached = unstable_cache(async (): Promise<Category[]> => {
  const supabase = createPublicSupabaseClientOptional();
  if (!supabase) return [];
  const result = await awaitPublicRequest(supabase.from("business_categories").select("slug,name_tr,icon").eq("active", true).order("sort_order"));
  if (!result) {
    console.error(JSON.stringify({ event: "public_categories_failed", code: "timeout" }));
    return [];
  }
  const { data, error } = result;
  if (error) {
    console.error(JSON.stringify({ event: "public_categories_failed", code: error.code }));
    return [];
  }
  return (data ?? []).map((row) => ({ id: row.slug, name: row.name_tr, icon: row.icon ?? "ellipsis", color: colors[row.slug] ?? "#F1F1F4" }));
}, ["public-categories-v2"], { revalidate: 300, tags: ["categories"] });

let localCategories: { expiresAt: number; value?: Category[]; pending?: Promise<Category[]> } | undefined;

export async function listPublicCategories() {
  const demoCategories = developmentDemoCategories();
  if (demoCategories.length) return demoCategories;

  const now = Date.now();
  if (localCategories?.value && localCategories.expiresAt > now) return localCategories.value;
  if (localCategories?.pending) return localCategories.pending;

  const pending = cached().then((value) => {
    localCategories = { value, expiresAt: Date.now() + 60_000 };
    return value;
  }).catch((error) => {
    localCategories = undefined;
    throw error;
  });
  localCategories = { pending, expiresAt: now + 60_000 };
  return pending;
}
