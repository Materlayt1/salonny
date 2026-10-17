import { NextResponse } from "next/server";
import { getMarketplaceBusiness } from "@/lib/marketplace";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const business = await getMarketplaceBusiness(slug);
  if (!business) {
    return NextResponse.json({ error: "İşletme bulunamadı." }, { status: 404 });
  }
  return NextResponse.json({ business }, {
    headers: {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
    },
  });
}
