import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { createServerClientOptional } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "Geçersiz istek kaynağı." }, { status: 403 });
  const rateKey = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const rate = await checkRateLimit(`business-cache:${rateKey}`, 30, 60_000);
  if (!rate.allowed) return NextResponse.json({ error: "Çok fazla yenileme isteği." }, { status: 429 });
  const supabase = await createServerClientOptional();
  if (!supabase) return NextResponse.json({ error: "Veritabanı bağlantısı yapılandırılmamış." }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Oturum açmanız gerekiyor." }, { status: 401 });
  const { count } = await supabase.from("business_members").select("business_id", { count: "exact", head: true }).eq("user_id", user.id).eq("active", true);
  if (!count) return NextResponse.json({ error: "İşletme yetkisi gerekiyor." }, { status: 403 });
  revalidateTag("marketplace", "max");
  revalidatePath("/");
  revalidatePath("/kesfet");
  return NextResponse.json({ revalidated: true });
}
