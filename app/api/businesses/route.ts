import { NextResponse } from "next/server";
import {
  listMarketplaceBusinessPage,
  type MarketplacePageSort,
} from "@/lib/marketplace";

const allowedSorts = new Set<MarketplacePageSort>([
  "recommended",
  "rating",
  "newest",
  "name",
]);

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const rawSort = params.get("sort") as MarketplacePageSort | null;
    const page = await listMarketplaceBusinessPage({
      offset: Number(params.get("offset") ?? 0),
      limit: Number(params.get("limit") ?? 100),
      query: params.get("q") ?? undefined,
      category: params.get("category") ?? undefined,
      city: params.get("city") ?? undefined,
      openNow: params.get("open") === "1",
      sort: rawSort && allowedSorts.has(rawSort) ? rawSort : "recommended",
    });
    return NextResponse.json(page, {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    });
  } catch {
    return NextResponse.json({ error: "İşletmeler alınamadı." }, { status: 500 });
  }
}
