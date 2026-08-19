import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerClientOptional } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";

const bodySchema = z.object({ ids: z.array(z.uuid()).max(100).optional() });

export async function PATCH(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "Geçersiz istek kaynağı." }, { status: 403 });
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return NextResponse.json({ error: "Yalnızca JSON istekleri desteklenir." }, { status: 415 });
  if (Number(request.headers.get("content-length") ?? 0) > 16_384) return NextResponse.json({ error: "İstek boyutu çok büyük." }, { status: 413 });
  const rateKey = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const rate = await checkRateLimit(`notifications:${rateKey}`, 30, 60_000);
  if (!rate.allowed) return NextResponse.json({ error: "Çok fazla işlem yaptınız." }, { status: 429 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Bildirim seçimi geçersiz." }, { status: 422 });
  const supabase = await createServerClientOptional();
  if (!supabase) return NextResponse.json({ error: "Veritabanı bağlantısı yapılandırılmamış." }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Oturum açmanız gerekiyor." }, { status: 401 });
  const readAt = new Date().toISOString();
  let query = supabase.from("notifications").update({ read_at: readAt }).eq("user_id", user.id).is("read_at", null);
  if (parsed.data.ids?.length) query = query.in("id", parsed.data.ids);
  const { error } = await query;
  if (error) return NextResponse.json({ error: "Bildirimler güncellenemedi." }, { status: 400 });
  return NextResponse.json({ readAt });
}
