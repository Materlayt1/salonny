import type { MetadataRoute } from "next";
import { BRAND } from "@/config/brand";
import { canonicalBusinessPath } from "@/lib/seo";
import { createPublicSupabaseClientOptional } from "@/lib/supabase/public";

const pageSize = 1000;
export async function generateSitemaps() {
  const supabase = createPublicSupabaseClientOptional(); if (!supabase) return [{ id: 0 }];
  const { count } = await supabase.from("businesses").select("id", { count: "exact", head: true }).eq("status", "published");
  return Array.from({ length: Math.max(1, Math.ceil((count ?? 0) / pageSize)) }, (_, id) => ({ id }));
}

type SitemapBusiness = { slug: string; updated_at: string; business_categories: { name_tr: string } | { name_tr: string }[] | null; business_locations: { district: string; city: string }[] | null };
function first<T>(value: T | T[] | null) { return Array.isArray(value) ? value[0] : value; }

export default async function sitemap({ id }: { id: Promise<number | string> | number | string }): Promise<MetadataRoute.Sitemap> {
  const pageId = Math.max(0, Number(await id) || 0);
  const staticRoutes = pageId === 0 ? [
    { path: "", frequency: "daily" as const, priority: 1 }, { path: "/kesfet", frequency: "daily" as const, priority: .9 },
    { path: "/business", frequency: "monthly" as const, priority: .7 }, { path: "/privacy", frequency: "yearly" as const, priority: .3 },
    { path: "/terms", frequency: "yearly" as const, priority: .3 }, { path: "/cookies", frequency: "yearly" as const, priority: .3 },
    { path: "/kvkk", frequency: "yearly" as const, priority: .3 }, { path: "/delete-account", frequency: "yearly" as const, priority: .2 },
  ].map((route) => ({ url: `${BRAND.siteUrl}${route.path}`, changeFrequency: route.frequency, priority: route.priority })) : [];
  const supabase = createPublicSupabaseClientOptional(); if (!supabase) return staticRoutes;
  const { data } = await supabase.from("businesses").select("slug,updated_at,business_categories(name_tr),business_locations(district,city)").eq("status", "published").order("updated_at", { ascending: false }).range(pageId * pageSize, pageId * pageSize + pageSize - 1);
  const businesses = ((data ?? []) as unknown as SitemapBusiness[]).flatMap((business) => { const category = first(business.business_categories); const location = business.business_locations?.[0]; if (!category || !location) return []; const path = canonicalBusinessPath({ slug: business.slug, category: category.name_tr, district: location.district, city: location.city }); return [{ url: `${BRAND.siteUrl}${path}`, lastModified: business.updated_at, changeFrequency: "weekly" as const, priority: .8 }]; });
  return [...staticRoutes, ...businesses];
}
