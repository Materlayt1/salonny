import { NextResponse } from "next/server";
import { z } from "zod";
import { apiRateLimit, readBoundedJson } from "@/lib/api-security";
import { createRequestClientOptional } from "@/lib/supabase/request";

const schema = z.object({ appointmentId: z.uuid(), rating: z.number().int().min(1).max(5), comment: z.string().trim().max(2000).optional().default("") });

export async function POST(request: Request) {
  const body = await readBoundedJson(request, 16_384);
  if (!body.ok) return body.response;
  const limited = await apiRateLimit(request, "review", 8, 60_000, { critical: true, message: "Çok fazla değerlendirme denemesi yaptınız." });
  if (limited) return limited;
  const parsed = schema.safeParse(body.value);
  if (!parsed.success) return NextResponse.json({ error: "Değerlendirme bilgileri geçersiz." }, { status: 422 });
  const supabase = await createRequestClientOptional(request);
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
