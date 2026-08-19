import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/lib/rate-limit";
import { createServerClientOptional } from "@/lib/supabase/server";

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
  if (message.includes("outside_working_hours")) return "Seçtiğiniz saat çalışma saatlerinin dışında.";
  if (message.includes("appointment_not_changeable")) return "Bu randevu artık değiştirilemiyor.";
  if (message.includes("appointment_not_found")) return "Randevu bulunamadı.";
  return "İşlem şu anda tamamlanamadı. Lütfen tekrar deneyin.";
}

async function authenticatedClient() {
  const supabase = await createServerClientOptional();
  if (!supabase) return { supabase: null, authenticated: false };
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, authenticated: Boolean(user) };
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!idSchema.safeParse(id).success) return NextResponse.json({ error: "Geçersiz randevu." }, { status: 400 });
  const date = new URL(request.url).searchParams.get("date");
  if (!date || !dateSchema.safeParse(date).success) return NextResponse.json({ error: "Geçerli bir tarih seçin." }, { status: 422 });
  const rateKey = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const rate = await checkRateLimit(`appointment-slots:${rateKey}`, 60, 60_000);
  if (!rate.allowed) return NextResponse.json({ error: "Çok fazla uygunluk sorgusu yaptınız." }, { status: 429 });
  const { supabase, authenticated } = await authenticatedClient();
  if (!authenticated) return NextResponse.json({ error: "Oturum açmanız gerekiyor." }, { status: 401 });
  if (!supabase) return NextResponse.json({ error: "Veritabanı bağlantısı yapılandırılmamış." }, { status: 503 });
  const { data, error } = await supabase.rpc("get_appointment_reschedule_slots", { p_appointment_id: id, p_date: date });
  if (error) return NextResponse.json({ error: errorMessage(error.message) }, { status: 400 });
  return NextResponse.json({ slots: (data ?? []).map((row: { starts_at: string }) => row.starts_at) });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const origin = request.headers.get("origin");
  const requestOrigin = new URL(request.url).origin;
  if (origin && origin !== requestOrigin) return NextResponse.json({ error: "Geçersiz istek kaynağı." }, { status: 403 });
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return NextResponse.json({ error: "Yalnızca JSON istekleri desteklenir." }, { status: 415 });
  if (Number(request.headers.get("content-length") ?? 0) > 16_384) return NextResponse.json({ error: "İstek boyutu çok büyük." }, { status: 413 });
  const { id } = await params;
  if (!idSchema.safeParse(id).success) return NextResponse.json({ error: "Geçersiz randevu." }, { status: 400 });
  const rateKey = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const rate = await checkRateLimit(`appointment-change:${rateKey}`, 12, 60_000);
  if (!rate.allowed) return NextResponse.json({ error: "Çok fazla işlem yaptınız. Lütfen kısa süre sonra tekrar deneyin." }, { status: 429 });
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "İşlem bilgileri geçersiz." }, { status: 422 });
  const { supabase, authenticated } = await authenticatedClient();
  if (!authenticated) return NextResponse.json({ error: "Oturum açmanız gerekiyor." }, { status: 401 });
  if (!supabase) return NextResponse.json({ error: "Veritabanı bağlantısı yapılandırılmamış." }, { status: 503 });

  if (parsed.data.action === "cancel") {
    const { data, error } = await supabase.rpc("cancel_customer_appointment", { p_appointment_id: id, p_reason: parsed.data.reason ?? null });
    if (error) return NextResponse.json({ error: errorMessage(error.message) }, { status: 400 });
    return NextResponse.json(data);
  }

  const { data, error } = await supabase.rpc("reschedule_customer_appointment", { p_appointment_id: id, p_new_starts_at: parsed.data.startsAt });
  if (error) return NextResponse.json({ error: errorMessage(error.message) }, { status: error.message.includes("appointment_conflict") ? 409 : 400 });
  return NextResponse.json({ id: data.id, status: data.status, startsAt: data.starts_at, endsAt: data.ends_at });
}
