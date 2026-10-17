import { NextResponse } from "next/server";
import { listMarketplaceBusinesses } from "@/lib/marketplace";
export async function GET() {
  const businesses = await listMarketplaceBusinesses(60);
  const services = new Map<string, { name: string; price: number }>();
  for (const business of businesses) for (const service of business.services) {
    const key = service.name.trim().toLocaleLowerCase("tr-TR");
    const previous = services.get(key);
    if (key && (!previous || previous.price > service.price)) services.set(key, { name: service.name, price: service.price });
  }
  const reviews = businesses.flatMap((business) => (business.reviewItems ?? []).filter((review) => review.comment.trim()).map((review) => ({ id: review.id, rating: review.rating, comment: review.comment, createdAt: review.createdAt, businessName: business.name, businessSlug: business.slug }))).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 8);
  return NextResponse.json({ services: [...services.values()].slice(0, 6), reviews }, { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } });
}
