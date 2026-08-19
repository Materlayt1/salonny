import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerClientOptional } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";

const bookingSchema = z.object({
  businessId: z.uuid(),
  branchId: z.uuid(),
  employeeId: z.uuid(),
  serviceId: z.uuid(),
  startsAt: z.iso.datetime({ offset: true }),
  customer: z.object({ name: z.string().min(2).max(120), phone: z.string().min(10).max(24), email: z.email() }),
  paymentMethod: z.enum(["business", "online"]),
});

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const requestOrigin = new URL(request.url).origin;
  const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL ? new URL(process.env.NEXT_PUBLIC_APP_URL).origin : requestOrigin;
  if (origin && origin !== requestOrigin && origin !== configuredOrigin) return NextResponse.json({ error: "Geçersiz istek kaynağı." }, { status: 403 });
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return NextResponse.json({ error: "Yalnızca JSON istekleri desteklenir." }, { status: 415 });
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 65_536) return NextResponse.json({ error: "İstek boyutu çok büyük." }, { status: 413 });
  const clientKey = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const rate = await checkRateLimit(`booking:${clientKey}`, 12, 60_000);
  if (!rate.allowed) return NextResponse.json({ error: "Çok fazla deneme yaptınız. Lütfen kısa süre sonra tekrar deneyin." }, { status: 429, headers: { "Retry-After": String(Math.ceil((rate.resetAt - Date.now()) / 1000)) } });
  const idempotencyKey = request.headers.get("idempotency-key");
  if (!idempotencyKey) return NextResponse.json({ error: "İşlem anahtarı eksik." }, { status: 400 });
  const parsed = bookingSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Randevu bilgileri geçersiz.", issues: parsed.error.issues }, { status: 422 });
  if (parsed.data.paymentMethod === "online") return NextResponse.json({ error: "Online ödeme sağlayıcısı henüz etkin değil. İşletmede ödeme seçin." }, { status: 501 });

  const supabase = await createServerClientOptional();
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
  return NextResponse.json({ id: data, status: appointment?.status ?? "pending" }, { status: 201 });
}
