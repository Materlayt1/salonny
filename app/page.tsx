import HomePageClient from "@/components/home-page-client";
import { listPublicCategories } from "@/lib/categories";
import { listMarketplaceBusinesses } from "@/lib/marketplace";
export default async function HomePage() {
  const [businesses, categories] = await Promise.all([listMarketplaceBusinesses(50).then(items => ({ items, unavailable: false })).catch(() => ({ items: [], unavailable: true })), listPublicCategories()]);
  return <HomePageClient initialBusinesses={businesses.items} initialUnavailable={businesses.unavailable} categories={categories} />;
}
