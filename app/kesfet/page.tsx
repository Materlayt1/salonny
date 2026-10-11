import type { Metadata } from "next";
import DiscoverPage from "@/components/discover-page-client";
import { listPublicCategories } from "@/lib/categories";
import { listMarketplaceBusinesses } from "@/lib/marketplace";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Yakındaki İşletmeleri Keşfet",
  description: "Kuaför, berber, güzellik, spa, veteriner ve diğer hizmet işletmelerini konum, fiyat ve puana göre keşfet.",
  alternates: { canonical: "/kesfet" },
};

export default async function DiscoverRoute() {
  const [businesses, categories] = await Promise.all([
    listMarketplaceBusinesses(100),
    listPublicCategories(),
  ]);
  return <DiscoverPage initialBusinesses={businesses} initialCategories={categories} />;
}
