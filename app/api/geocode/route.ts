import { NextResponse } from "next/server";
import { z } from "zod";
import { GeocodingBusyError, searchTurkeyAddress } from "@/lib/geocoding";
import { checkRateLimit } from "@/lib/rate-limit";
import { createServerClientOptional } from "@/lib/supabase/server";

const querySchema = z.object({ q: z.string().trim().min(3).max(180) });

export async function GET(request: Request) {
  const clientKey = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const rate = await checkRateLimit(`geocode:${clientKey}`, 20, 10 * 60_000);
  if (!rate.allowed) return NextResponse.json({ error: "Çok fazla adres araması yaptınız. Lütfen biraz sonra tekrar deneyin." }, { status: 429 });

  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Aramak için en az 3 karakterlik bir adres girin." }, { status: 422 });

  const supabase = await createServerClientOptional();
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
