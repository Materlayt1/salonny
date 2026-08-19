import BusinessDetailPage, { generateMetadata as businessMetadata } from "@/app/business/[slug]/page";
import { getMarketplaceBusiness } from "@/lib/marketplace";
import { canonicalBusinessPath } from "@/lib/seo";
import { permanentRedirect } from "next/navigation";
export async function generateMetadata({ params }: { params: Promise<{ city: string; district: string; category: string; slug: string }> }) { const { slug } = await params; return businessMetadata({ params: Promise.resolve({ slug }) }); }
export default async function SeoBusinessPage({ params }: { params: Promise<{ city: string; district: string; category: string; slug: string }> }) { const values = await params; const business = await getMarketplaceBusiness(values.slug); if (business) { const canonical = canonicalBusinessPath(business); const incoming = `/${values.city}/${values.district}/${values.category}/${values.slug}`; if (incoming !== canonical) permanentRedirect(canonical); } return BusinessDetailPage({ params: Promise.resolve({ slug: values.slug }) }); }
