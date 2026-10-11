import { NextResponse } from "next/server";
import {
  listMarketplaceBusinessPage,
  MarketplaceSearchUnavailableError,
  type MarketplacePageSort,
} from "@/lib/marketplace";

const allowedSorts = new Set<MarketplacePageSort>([
  "recommended",
  "rating",
  "newest",
  "name",
  "price",
  "nearest",
]);

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const rawSort = params.get("sort") as MarketplacePageSort | null;
    const offset = Number(params.get("offset") ?? 0);
    const limit = Number(params.get("limit") ?? 100);
    if (!Number.isInteger(offset) || offset < 0 || offset > 100_000 || !Number.isInteger(limit) || limit < 1 || limit > 100) return NextResponse.json({ error: "Geçersiz sayfa bilgisi." }, { status: 422, headers: { "Cache-Control": "no-store" } });
    const latitude = params.has("lat") ? Number(params.get("lat")) : undefined;
    const longitude = params.has("lng") ? Number(params.get("lng")) : undefined;
    if ((latitude !== undefined || longitude !== undefined || rawSort === "nearest") &&
      (!params.get("lat")?.trim() || !params.get("lng")?.trim() || latitude === undefined || longitude === undefined || !Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180 || (latitude === 0 && longitude === 0))) {
      return NextResponse.json({ error: "Yakınlık sıralaması için geçerli bir konum gerekiyor." }, { status: 422, headers: { "Cache-Control": "no-store" } });
    }
    const page = await listMarketplaceBusinessPage({
      offset, limit,
      query: params.get("q") ?? undefined,
      category: params.get("category") ?? undefined,
      city: params.get("city") ?? undefined,
      openNow: params.get("open") === "1",
      sort: rawSort && allowedSorts.has(rawSort) ? rawSort : "recommended",
      latitude, longitude,
    });
    return NextResponse.json(page, {
      headers: {
        "Cache-Control": latitude !== undefined ? "private, no-store" : "public, s-maxage=60, stale-while-revalidate=300",
      },
    });
  } catch (error) {
    if (error instanceof MarketplaceSearchUnavailableError) return NextResponse.json({ error: "Arama servisine şu anda ulaşılamıyor. Yeniden dene." }, { status: 503, headers: { "Cache-Control": "no-store" } });
    return NextResponse.json({ error: "İşletmeler alınamadı." }, { status: 500 });
  }
}
