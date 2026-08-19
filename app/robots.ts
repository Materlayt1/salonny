import type { MetadataRoute } from "next";
import { BRAND } from "@/config/brand";
import { createPublicSupabaseClientOptional } from "@/lib/supabase/public";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const supabase = createPublicSupabaseClientOptional();
  const { count } = supabase ? await supabase.from("businesses").select("id", { count: "exact", head: true }).eq("status", "published") : { count: 0 };
  const sitemapCount = Math.max(1, Math.ceil((count ?? 0) / 1000));
  return {
    rules: [{ userAgent: "*", allow: ["/", "/business/"], disallow: ["/admin/", "/auth/", "/profile/", "/appointments/", "/favorites/", "/notifications/", "/business/dashboard", "/business/calendar", "/business/appointments", "/business/customers", "/business/services", "/business/employees", "/business/reports", "/business/inventory", "/business/campaigns", "/business/settings", "/business/onboarding", "/api/", "/*?*next=*", "/*?*token=*"] }],
    sitemap: Array.from({ length: sitemapCount }, (_, id) => `${BRAND.siteUrl}/sitemap/${id}.xml`),
    host: BRAND.siteUrl,
  };
}
