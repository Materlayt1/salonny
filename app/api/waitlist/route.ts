import { NextResponse } from "next/server";
import { z } from "zod";
import { apiRateLimit, readBoundedJson } from "@/lib/api-security";
import { createRequestClientOptional } from "@/lib/supabase/request";

const schema = z.object({
  businessId: z.string().uuid(),
  branchId: z.string().uuid(),
  serviceId: z.string().uuid(),
  employeeId: z.string().uuid().nullable(),
  desiredFrom: z.string().datetime({ offset: true }),
  desiredTo: z.string().datetime({ offset: true }),
});

export async function POST(request: Request) {
  const body = await readBoundedJson(request, 16_384);
  if (!body.ok) return body.response;
  const limited = await apiRateLimit(request, "customer-waitlist", 10, 60_000);
  if (limited) return limited;
  const parsed = schema.safeParse(body.value);
  if (!parsed.success)
    return NextResponse.json(
      { error: "Geçersiz bekleme listesi talebi." },
      { status: 422 },
    );
  const supabase = await createRequestClientOptional(request);
  if (!supabase)
    return NextResponse.json(
      { error: "Kimlik servisi kullanılamıyor." },
      { status: 503 },
    );
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Giriş yapmalısınız." }, { status: 401 });
  const { data, error } = await supabase.rpc("join_customer_waitlist", {
    p_business_id: parsed.data.businessId,
    p_branch_id: parsed.data.branchId,
    p_service_id: parsed.data.serviceId,
    p_employee_id: parsed.data.employeeId,
    p_desired_from: parsed.data.desiredFrom,
    p_desired_to: parsed.data.desiredTo,
  });
  if (error) {
    const message = error.message.includes("phone_required")
      ? "Profilinize telefon numarası ekleyin."
      : error.message.includes("phone_already_associated")
        ? "Telefon numaranız için doğrulama gerekiyor. Lütfen işletmeyle iletişime geçin."
      : error.message.includes("already_waiting") || error.code === "23505"
        ? "Bu hizmet için zaten bekleme listesindesiniz."
        : "Bekleme listesine eklenemediniz.";
    return NextResponse.json({ error: message }, { status: 409 });
  }
  return NextResponse.json({ id: data }, { status: 201 });
}

export async function GET(request: Request) {
  const limited = await apiRateLimit(
    request,
    "customer-waitlist-read",
    60,
    60_000,
  );
  if (limited) return limited;
  const supabase = await createRequestClientOptional(request);
  if (!supabase)
    return NextResponse.json(
      { error: "Kimlik servisi kullanılamıyor." },
      { status: 503 },
    );
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Giriş yapmalısınız." }, { status: 401 });
  const { data, error } = await supabase.rpc("get_my_waitlist_entries");
  if (error)
    return NextResponse.json(
      { error: "Bekleme listesi alınamadı." },
      { status: 503 },
    );
  return NextResponse.json(
    { entries: data ?? [] },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function PATCH(request: Request) {
  const body = await readBoundedJson(request, 8_192);
  if (!body.ok) return body.response;
  const limited = await apiRateLimit(
    request,
    "customer-waitlist-accept",
    10,
    60_000,
  );
  if (limited) return limited;
  const parsed = z
    .object({ entryId: z.string().uuid() })
    .safeParse(body.value);
  if (!parsed.success)
    return NextResponse.json({ error: "Geçersiz teklif." }, { status: 422 });
  const supabase = await createRequestClientOptional(request);
  if (!supabase)
    return NextResponse.json(
      { error: "Kimlik servisi kullanılamıyor." },
      { status: 503 },
    );
  const { data, error } = await supabase.rpc("accept_customer_waitlist_offer", {
    p_entry_id: parsed.data.entryId,
  });
  if (error || !data)
    return NextResponse.json(
      { error: "Teklifin süresi dolmuş veya teklif bulunamadı." },
      { status: 409 },
    );
  return NextResponse.json({ accepted: true });
}
