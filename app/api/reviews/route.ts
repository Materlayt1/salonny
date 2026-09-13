import { NextResponse } from "next/server";
import { z } from "zod";
import { apiRateLimit } from "@/lib/api-security";
import { createServerClientOptional } from "@/lib/supabase/server";

const schema = z.object({ appointmentId: z.uuid(), rating: z.number().int().min(1).max(5), comment: z.string().trim().max(2000).optional().default("") });

export async function POST(request: Request) {
  const origin = request.headers.get("origin"); const requestOrigin = new URL(request.url).origin;
  if (origin && origin !== requestOrigin) return NextResponse.json({ error: "Geçersiz istek kaynağı." }, { status: 403 });
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return NextResponse.json({ error: "Yalnızca JSON istekleri desteklenir." }, { status: 415 });
  if (Number(request.headers.get("content-length") ?? 0) > 16_384) return NextResponse.json({ error: "İstek boyutu çok büyük." }, { status: 413 });
  const limited = await apiRateLimit(request, "review", 8, 60_000, { critical: true, message: "Çok fazla değerlendirme denemesi yaptınız." });
  if (limited) return limited;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Değerlendirme bilgileri geçersiz." }, { status: 422 });
  const supabase = await createServerClientOptional();
  if (!supabase) return NextResponse.json({ error: "Veritabanı bağlantısı yapılandırılmamış." }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Değerlendirme için giriş yapmalısınız." }, { status: 401 });
  const { data, error } = await supabase.rpc("create_verified_review", { p_appointment_id: parsed.data.appointmentId, p_rating: parsed.data.rating, p_comment: parsed.data.comment || null });
  if (error) {
    const message = error.message.includes("appointment_not_completed") ? "Yalnız tamamlanmış randevular değerlendirilebilir." : error.message.includes("review_already_exists") ? "Bu randevuyu daha önce değerlendirdiniz." : error.message.includes("appointment_not_found") ? "Randevu bulunamadı." : "Değerlendirme kaydedilemedi.";
    return NextResponse.json({ error: message }, { status: error.message.includes("review_already_exists") ? 409 : 400 });
  }
  return NextResponse.json({ review: data }, { status: 201 });
}
