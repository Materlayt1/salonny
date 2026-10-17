import HomePageClient from "@/components/home-page-client";
import { listPublicCategories } from "@/lib/categories";
import { listMarketplaceBusinesses } from "@/lib/marketplace";
export default async function HomePage() {
  const [businesses, categories] = await Promise.all([listMarketplaceBusinesses(50), listPublicCategories()]);
  return <HomePageClient initialBusinesses={businesses} categories={categories} />;
}
