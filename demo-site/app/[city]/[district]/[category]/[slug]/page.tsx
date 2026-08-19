export { default, generateMetadata } from "../../../../../../app/[city]/[district]/[category]/[slug]/page";
import { DEMO_BUSINESSES } from "@/lib/demo-data";
import { seoSlug } from "@/lib/seo";

export const dynamicParams = false;
export function generateStaticParams() {
  return DEMO_BUSINESSES.map((business) => ({ city: seoSlug(business.city), district: seoSlug(business.district), category: seoSlug(business.category), slug: business.slug }));
}
