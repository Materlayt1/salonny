import { NextResponse } from "next/server";
import { z } from "zod";
import { GeocodingBusyError, searchTurkeyAddress } from "@/lib/geocoding";
import { apiRateLimit } from "@/lib/api-security";
import { createRequestClientOptional } from "@/lib/supabase/request";

const querySchema = z.object({ q: z.string().trim().min(3).max(180) });

export async function GET(request: Request) {
  const limited = await apiRateLimit(request, "geocode", 20, 10 * 60_000, { message: "Çok fazla adres araması yaptınız. Lütfen biraz sonra tekrar deneyin." });
  if (limited) return limited;

  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Aramak için en az 3 karakterlik bir adres girin." }, { status: 422 });

  const supabase = await createRequestClientOptional(request);
  if (supabase) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Konum aramak için oturum açmanız gerekiyor." }, { status: 401 });
  }

  try {
    return NextResponse.json({ results: await searchTurkeyAddress(parsed.data.q) });
  } catch (error) {
    if (error instanceof GeocodingBusyError) return NextResponse.json({ error: "Harita servisi meşgul. Bir saniye sonra tekrar deneyin." }, { status: 429 });
    return NextResponse.json({ error: "Adres şu anda aranamadı. Haritadan konumu elle seçebilirsiniz." }, { status: 502 });
  }
}
