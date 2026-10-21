import { NextResponse } from "next/server";
import { apiRateLimit } from "@/lib/api-security";
import { getCustomerAppointmentsWithClient } from "@/lib/customer-appointments";
import { createRequestClientOptional } from "@/lib/supabase/request";

export async function GET(request: Request) {
  const limited = await apiRateLimit(request, "appointments-read", 60, 60_000);
  if (limited) return limited;
  const supabase = await createRequestClientOptional(request);
  if (!supabase) {
    return NextResponse.json(
      { error: "Kimlik servisi kullanılamıyor." },
      { status: 503 },
    );
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Oturum açmanız gerekiyor." }, { status: 401 });
  }
  try {
    const appointments = await getCustomerAppointmentsWithClient(supabase);
    return NextResponse.json(
      { appointments },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return NextResponse.json({ error: "Randevular alınamadı." }, { status: 500 });
  }
}
