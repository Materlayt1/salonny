import { NextResponse } from "next/server";
import { listMarketplaceBusinesses } from "@/lib/marketplace";
export async function GET() {
  let businesses;
  try { businesses = await listMarketplaceBusinesses(60); }
  catch { return NextResponse.json({ error: "İşletmeler şu anda alınamıyor." }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
  const services = new Map<string, { name: string; price: number }>();
  for (const business of businesses) for (const service of business.services) {
    const key = service.name.trim().toLocaleLowerCase("tr-TR");
    const previous = services.get(key);
    if (key && (!previous || previous.price > service.price)) services.set(key, { name: service.name, price: service.price });
  }
  const reviews = businesses.flatMap((business) => (business.reviewItems ?? []).filter((review) => review.comment.trim()).map((review) => ({ id: review.id, rating: review.rating, comment: review.comment, createdAt: review.createdAt, businessName: business.name, businessSlug: business.slug }))).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 8);
  return NextResponse.json({ services: [...services.values()].slice(0, 6), reviews }, { headers: { "Cache-Control": "no-store" } });
}
