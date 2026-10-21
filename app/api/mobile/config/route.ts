import { NextResponse } from "next/server";

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !publishableKey || process.env.NEXT_PUBLIC_SUPABASE_OFFLINE === "true") {
    return NextResponse.json({ error: "Giriş servisine şu anda ulaşılamıyor." }, { status: 503 });
  }
  // These are the same public project credentials shipped in the web bundle.
  // Never include service-role credentials or deployment secrets here.
  return NextResponse.json({ url, publishableKey }, {
    headers: { "Cache-Control": "public, max-age=60, s-maxage=60" },
  });
}
