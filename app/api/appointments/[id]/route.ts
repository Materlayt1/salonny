import { NextResponse } from "next/server";
import { z } from "zod";
import { apiRateLimit, readBoundedJson } from "@/lib/api-security";
import { createRequestClientOptional } from "@/lib/supabase/request";

const idSchema = z.uuid();
const dateSchema = z.iso.date();
const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("cancel"), reason: z.string().trim().max(500).optional() }),
  z.object({ action: z.literal("reschedule"), startsAt: z.iso.datetime({ offset: true }) }),
]);

function errorMessage(message: string) {
  if (message.includes("cancellation_window_closed")) return "İşletmenin iptal süresi dolduğu için bu randevu artık iptal edilemiyor.";
  if (message.includes("minimum_notice_required")) return "Seçtiğiniz saat işletmenin minimum bildirim süresine uymuyor.";
  if (message.includes("appointment_conflict")) return "Bu saat az önce doldu. Lütfen başka bir saat seçin.";
  if (message.includes("resource_graph_changed")) return "Hizmetin kaynak ihtiyaçları değişmiş. Randevunu taşımak için işletmeyle iletişime geç; mevcut randevun korunuyor.";
  if (message.includes("resource_conflict")) return "Seçtiğin saatte gerekli oda, koltuk veya cihaz dolu. Başka bir saat seç; mevcut randevun korunuyor.";
  if (message.includes("outside_working_hours")) return "Seçtiğiniz saat çalışma saatlerinin dışında.";
  if (message.includes("appointment_not_changeable")) return "Bu randevu artık değiştirilemiyor.";
  if (message.includes("appointment_not_found")) return "Randevu bulunamadı.";
  return "İşlem şu anda tamamlanamadı. Lütfen tekrar deneyin.";
}

async function authenticatedClient(request: Request) {
  const supabase = await createRequestClientOptional(request);
  if (!supabase) return { supabase: null, authenticated: false };
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, authenticated: Boolean(user) };
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!idSchema.safeParse(id).success) return NextResponse.json({ error: "Geçersiz randevu." }, { status: 400 });
  const date = new URL(request.url).searchParams.get("date");
  if (!date || !dateSchema.safeParse(date).success) return NextResponse.json({ error: "Geçerli bir tarih seçin." }, { status: 422 });
  const limited = await apiRateLimit(request, "appointment-slots", 60, 60_000, { message: "Çok fazla uygunluk sorgusu yaptınız." });
  if (limited) return limited;
  const { supabase, authenticated } = await authenticatedClient(request);
  if (!authenticated) return NextResponse.json({ error: "Oturum açmanız gerekiyor." }, { status: 401 });
  if (!supabase) return NextResponse.json({ error: "Veritabanı bağlantısı yapılandırılmamış." }, { status: 503 });
  const { data, error } = await supabase.rpc("get_appointment_reschedule_slots", { p_appointment_id: id, p_date: date });
  if (error) return NextResponse.json({ error: errorMessage(error.message) }, { status: 400 });
  return NextResponse.json({ slots: (data ?? []).map((row: { starts_at: string }) => row.starts_at) });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const body = await readBoundedJson(request, 16_384);
  if (!body.ok) return body.response;
  const { id } = await params;
  if (!idSchema.safeParse(id).success) return NextResponse.json({ error: "Geçersiz randevu." }, { status: 400 });
  const limited = await apiRateLimit(request, "appointment-change", 12, 60_000, { critical: true, message: "Çok fazla işlem yaptınız. Lütfen kısa süre sonra tekrar deneyin." });
  if (limited) return limited;
  const parsed = actionSchema.safeParse(body.value);
  if (!parsed.success) return NextResponse.json({ error: "İşlem bilgileri geçersiz." }, { status: 422 });
  const { supabase, authenticated } = await authenticatedClient(request);
  if (!authenticated) return NextResponse.json({ error: "Oturum açmanız gerekiyor." }, { status: 401 });
  if (!supabase) return NextResponse.json({ error: "Veritabanı bağlantısı yapılandırılmamış." }, { status: 503 });

  if (parsed.data.action === "cancel") {
    const { data, error } = await supabase.rpc("cancel_customer_appointment", { p_appointment_id: id, p_reason: parsed.data.reason ?? null });
    if (error) return NextResponse.json({ error: errorMessage(error.message) }, { status: 400 });
    return NextResponse.json(data);
  }

  const { data, error } = await supabase.rpc("reschedule_customer_appointment", { p_appointment_id: id, p_new_starts_at: parsed.data.startsAt });
  if (error) return NextResponse.json({ error: errorMessage(error.message) }, { status: ["appointment_conflict", "resource_conflict", "resource_graph_changed"].some((code) => error.message.includes(code)) ? 409 : 400 });
  return NextResponse.json({ id: data.id, status: data.status, startsAt: data.starts_at, endsAt: data.ends_at });
}
