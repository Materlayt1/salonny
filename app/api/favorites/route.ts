import { NextResponse } from "next/server";
import { apiRateLimit } from "@/lib/api-security";
import { getMarketplaceBusiness } from "@/lib/marketplace";
import { createRequestClientOptional } from "@/lib/supabase/request";

type FavoriteRow = {
  businesses: { slug: string } | { slug: string }[] | null;
};

export async function GET(request: Request) {
  const limited = await apiRateLimit(request, "favorites-read", 60, 60_000);
  if (limited) return limited;
  const supabase = await createRequestClientOptional(request);
  if (!supabase) {
    return NextResponse.json({ error: "Kimlik servisi kullanılamıyor." }, { status: 503 });
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Oturum açmanız gerekiyor." }, { status: 401 });
  }
  const { data, error } = await supabase
    .from("favorites")
    .select("businesses(slug)")
    .eq("user_id", user.id)
    .limit(100);
  if (error) {
    return NextResponse.json({ error: "Favoriler alınamadı." }, { status: 500 });
  }
  const slugs = (data as unknown as FavoriteRow[]).flatMap((row) => {
    const value = Array.isArray(row.businesses) ? row.businesses[0] : row.businesses;
    return value?.slug ? [value.slug] : [];
  });
  const businesses = (await Promise.all(slugs.map(getMarketplaceBusiness)))
    .filter((business) => business !== null);
  return NextResponse.json(
    { businesses },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
