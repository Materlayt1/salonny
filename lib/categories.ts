import "server-only";
import { unstable_cache } from "next/cache";
import { DEMO_CATEGORIES } from "@/lib/demo-data";
import { createPublicSupabaseClientOptional } from "@/lib/supabase/public";
import type { Category } from "@/lib/types";

const colors: Record<string, string> = { kuafor: "#EEE6FF", berber: "#F2E5FF", guzellik: "#FFE4EF", nail: "#EFE5FF", spa: "#FFEBDD", veteriner: "#DFF7EC", "pet-kuaforu": "#DFF1FF", fitness: "#E2F7F1", pilates: "#E7ECFF", diger: "#F1F1F4" };
const cached = unstable_cache(async (): Promise<Category[]> => { if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") return DEMO_CATEGORIES; const supabase = createPublicSupabaseClientOptional(); if (!supabase) return []; const { data, error } = await supabase.from("business_categories").select("slug,name_tr,icon").eq("active", true).order("sort_order"); if (error) throw new Error(`Kategoriler alınamadı: ${error.message}`); return (data ?? []).map((row) => ({ id: row.slug, name: row.name_tr, icon: row.icon ?? "ellipsis", color: colors[row.slug] ?? "#F1F1F4" })); }, ["public-categories"], { revalidate: 300, tags: ["categories"] });
export async function listPublicCategories() { return cached(); }
