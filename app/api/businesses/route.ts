import { NextResponse } from "next/server";
import { listMarketplaceBusinesses } from "@/lib/marketplace";

export async function GET() {
  try {
    return NextResponse.json({ businesses: await listMarketplaceBusinesses(100) }, { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } });
  } catch {
    return NextResponse.json({ error: "İşletmeler alınamadı." }, { status: 500 });
  }
}
