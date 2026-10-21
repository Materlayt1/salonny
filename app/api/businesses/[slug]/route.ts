import { NextResponse } from "next/server";
import { getMarketplaceBusiness } from "@/lib/marketplace";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  let business;
  try { business = await getMarketplaceBusiness(slug); }
  catch { return NextResponse.json({ error: "İşletme bilgilerine şu anda ulaşılamıyor. Yeniden dene.", code: "marketplace_unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
  if (!business) {
    return NextResponse.json({ error: "İşletme şu anda yayında değil veya artık mevcut değil.", code: "business_unavailable" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json({ business }, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
