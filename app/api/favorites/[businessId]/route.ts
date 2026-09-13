import { NextResponse } from "next/server";
import { z } from "zod";
import { apiRateLimit } from "@/lib/api-security";
import { createServerClientOptional } from "@/lib/supabase/server";

const idSchema = z.uuid();

async function mutateFavorite(request: Request, businessId: string, remove: boolean) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "Geçersiz istek kaynağı." }, { status: 403 });
  if (!idSchema.safeParse(businessId).success) return NextResponse.json({ error: "Geçersiz işletme." }, { status: 400 });
  const limited = await apiRateLimit(request, "favorite-change", 30, 60_000, { critical: true, message: "Çok fazla favori işlemi yaptınız." });
  if (limited) return limited;

  const supabase = await createServerClientOptional();
  if (!supabase) return NextResponse.json({ error: "Veritabanı bağlantısı yapılandırılmamış." }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Oturum açmanız gerekiyor." }, { status: 401 });

  const { error } = remove
    ? await supabase.from("favorites").delete().eq("user_id", user.id).eq("business_id", businessId)
    : await supabase.from("favorites").upsert({ user_id: user.id, business_id: businessId }, { onConflict: "user_id,business_id", ignoreDuplicates: true });
  if (error) return NextResponse.json({ error: "Favori işlemi tamamlanamadı." }, { status: 400 });
  return new NextResponse(null, { status: 204 });
}

export async function POST(request: Request, { params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  return mutateFavorite(request, businessId, false);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  return mutateFavorite(request, businessId, true);
}
