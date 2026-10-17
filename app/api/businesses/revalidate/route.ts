import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { apiRateLimit } from "@/lib/api-security";
import { createRequestClientOptional } from "@/lib/supabase/request";

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "Geçersiz istek kaynağı." }, { status: 403 });
  const limited = await apiRateLimit(request, "business-cache", 30, 60_000, { critical: true, message: "Çok fazla yenileme isteği." });
  if (limited) return limited;
  const supabase = await createRequestClientOptional(request);
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
