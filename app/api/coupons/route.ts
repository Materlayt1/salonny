import { NextResponse } from "next/server";
import { z } from "zod";
import { apiRateLimit, readBoundedJson } from "@/lib/api-security";
import { createPublicSupabaseClientOptional } from "@/lib/supabase/public";
import { createRequestClientOptional } from "@/lib/supabase/request";
import { couponFailure, couponOffer, couponQuote, couponSelection } from "@/lib/coupon-contract";
import { getCustomerBookingPolicy, bookingPolicyStatus, bookingRuleFailure } from "@/lib/customer-booking-policy";
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
export async function GET(request: Request) {
  try {
    const businessId = z.uuid().safeParse(new URL(request.url).searchParams.get("businessId"));
    if (!businessId.success) return reply({ error: "Geçersiz işletme." }, 422);
    const limited = await apiRateLimit(request, "public-coupons", 120, 60_000); if (limited) return limited;
    const client = createPublicSupabaseClientOptional();
    if (!client) return reply({ error: "Kampanyalar şu anda alınamadı." }, 503);
    const result = await client.rpc("list_business_coupons", { p_business_id: businessId.data });
    if (result.error) return reply({ error: "Kampanyalar şu anda alınamadı." }, 503);
    const offers = z.array(couponOffer).max(20).parse((result.data ?? []).map((row: { code: string; kind: string; value: number; ends_at: string | null; audience: string }) => ({ code: row.code, kind: row.kind, value: row.value, endsAt: row.ends_at, audience: row.audience })));
    return reply({ offers });
  } catch { return reply({ error: "Kampanyalar şu anda alınamadı." }, 503); }
}
export async function POST(request: Request) {
  try {
    const body = await readBoundedJson(request, 4096); if (!body.ok) return body.response;
    const parsed = couponSelection.safeParse(body.value);
    if (!parsed.success) return reply({ error: "Kupon kodunu ve hizmet seçimini kontrol et." }, 422);
    const limited = await apiRateLimit(request, "customer-coupon-quote", 30, 60_000, { critical: true }); if (limited) return limited;
    const client = await createRequestClientOptional(request);
    if (!client) return reply({ error: "Kupon servisine ulaşılamadı." }, 503);
    const user = (await client.auth.getUser()).data.user;
    if (!user) return reply({ error: "Kupon uygulamak için giriş yapmalısın." }, 401);
    const values = parsed.data;
    const policy = await getCustomerBookingPolicy(client, user.id, values.businessId);
    if (!policy.allowed) return reply({ error: policy.message, code: policy.code }, bookingPolicyStatus(policy));
    const result = await client.rpc("quote_customer_coupon", { p_business_id: values.businessId, p_branch_id: values.branchId, p_employee_id: values.employeeId, p_service_id: values.serviceId, p_code: values.code });
    if (result.error) { const rule = bookingRuleFailure(result.error); if (rule) return reply({ error: rule.message, code: rule.code }, rule.status); const failure = couponFailure(result.error); return reply({ error: failure.message, code: failure.code }, failure.status); }
    const quote = couponQuote.parse(result.data);
    if (quote.code !== values.code) throw new Error("Unexpected coupon");
    return reply(quote);
  } catch { return reply({ error: "Kupon şu anda doğrulanamadı. Daha sonra tekrar dene." }, 503); }
}
