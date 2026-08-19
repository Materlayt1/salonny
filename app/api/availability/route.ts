import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/lib/rate-limit";
import { createServerClientOptional } from "@/lib/supabase/server";

const querySchema = z.object({
  businessId: z.uuid(),
  branchId: z.uuid(),
  employeeId: z.uuid(),
  serviceId: z.uuid(),
  date: z.iso.date(),
});

export async function GET(request: Request) {
  const rateKey = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const rate = await checkRateLimit(`availability:${rateKey}`, 60, 60_000);
  if (!rate.allowed) return NextResponse.json({ error: "Çok fazla uygunluk sorgusu yaptınız." }, { status: 429 });
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Uygunluk bilgileri geçersiz." }, { status: 422 });
  const supabase = await createServerClientOptional();
  if (!supabase) return NextResponse.json({ error: "Veritabanı bağlantısı yapılandırılmamış." }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Oturum açmanız gerekiyor." }, { status: 401 });
  const { data, error } = await supabase.rpc("get_booking_slots", {
    p_business_id: parsed.data.businessId,
    p_branch_id: parsed.data.branchId,
    p_employee_id: parsed.data.employeeId,
    p_service_id: parsed.data.serviceId,
    p_date: parsed.data.date,
  });
  if (error) return NextResponse.json({ error: "Uygun saatler alınamadı." }, { status: 400 });
  return NextResponse.json({ slots: (data ?? []).map((row: { starts_at: string }) => row.starts_at) });
}
