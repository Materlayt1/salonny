import { NextResponse } from "next/server";
import { z } from "zod";
import { createRequestClientOptional } from "@/lib/supabase/request";
import { apiRateLimit, readBoundedJson } from "@/lib/api-security";

const bookingSchema = z.object({
  businessId: z.uuid(),
  branchId: z.uuid(),
  employeeId: z.uuid(),
  serviceId: z.uuid(),
  startsAt: z.iso.datetime({ offset: true }),
  customer: z.object({ name: z.string().min(2).max(120), phone: z.string().min(10).max(24), email: z.email() }),
  paymentMethod: z.enum(["business", "online"]),
  bookingToken: z.string().regex(/^[a-f0-9]{18}$/i).optional(),
});

export async function POST(request: Request) {
  const body = await readBoundedJson(request, 65_536);
  if (!body.ok) return body.response;
  const limited = await apiRateLimit(request, "booking", 12, 60_000, { critical: true, message: "Çok fazla deneme yaptınız. Lütfen kısa süre sonra tekrar deneyin." });
  if (limited) return limited;
  const idempotencyKey = request.headers.get("idempotency-key");
  if (!idempotencyKey) return NextResponse.json({ error: "İşlem anahtarı eksik." }, { status: 400 });
  const parsed = bookingSchema.safeParse(body.value);
  if (!parsed.success) return NextResponse.json({ error: "Randevu bilgileri geçersiz.", issues: parsed.error.issues }, { status: 422 });
  if (parsed.data.paymentMethod === "online") return NextResponse.json({ error: "Online ödeme sağlayıcısı henüz etkin değil. İşletmede ödeme seçin." }, { status: 501 });

  const supabase = await createRequestClientOptional(request);
  if (!supabase) {
    return NextResponse.json({ error: "Veritabanı bağlantısı yapılandırılmamış." }, { status: 503 });
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Randevu oluşturmak için giriş yapmanız gerekiyor." }, { status: 401 });

  const { data, error } = await supabase.rpc("create_appointment_atomic", {
    p_business_id: parsed.data.businessId,
    p_branch_id: parsed.data.branchId,
    p_employee_id: parsed.data.employeeId,
    p_service_id: parsed.data.serviceId,
    p_starts_at: parsed.data.startsAt,
    p_customer_name: parsed.data.customer.name,
    p_customer_phone: parsed.data.customer.phone,
    p_customer_email: parsed.data.customer.email,
    p_idempotency_key: idempotencyKey,
  });
  if (error) {
    const conflict = error.code === "23P01" || error.message.includes("appointment_conflict") || error.message.includes("slot_not_available");
    return NextResponse.json({ error: conflict ? "Bu saat az önce doldu. Lütfen başka bir saat seçin." : "Randevu oluşturulamadı." }, { status: conflict ? 409 : 500 });
  }
  const { data: appointment } = await supabase.from("appointments").select("status").eq("id", data).eq("customer_user_id", user.id).maybeSingle();
  if (parsed.data.bookingToken) await supabase.rpc("track_booking_conversion", { p_token: parsed.data.bookingToken });
  return NextResponse.json({ id: data, status: appointment?.status ?? "pending" }, { status: 201 });
}
