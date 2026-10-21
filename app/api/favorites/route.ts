import { NextResponse } from "next/server";
import { apiRateLimit } from "@/lib/api-security";
import { getMarketplaceBusinessSummaries } from "@/lib/marketplace";
import { createRequestClientOptional } from "@/lib/supabase/request";

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
    .select("business_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) {
    return NextResponse.json({ error: "Favoriler alınamadı." }, { status: 500 });
  }
  let businesses;
  try {
    businesses = await getMarketplaceBusinessSummaries(supabase, (data ?? []).map((row) => row.business_id));
  } catch {
    return NextResponse.json({ error: "Favoriler alınamadı." }, { status: 503 });
  }
  return NextResponse.json(
    { businesses },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
