import { NextResponse } from "next/server";
import { z } from "zod";
import { createRequestClientOptional } from "@/lib/supabase/request";
import { apiRateLimit } from "@/lib/api-security";
import { getCustomerBookingPolicy } from "@/lib/customer-booking-policy";

const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
export async function GET(request: Request) {
  const search = new URL(request.url).searchParams;
  const selected = z.object({ businessId: z.uuid() }).strict().safeParse(Object.fromEntries(search));
  if (!selected.success || [...search.keys()].length !== 1) return reply({ error: "Geçersiz işletme seçimi." }, 422);
  const limited = await apiRateLimit(request, "customer-booking-policy", 60, 60_000); if (limited) return limited;
  const client = await createRequestClientOptional(request);
  if (!client) return reply({ error: "Randevu yetkisi doğrulanamadı." }, 503);
  const user = (await client.auth.getUser()).data.user;
  if (!user) return reply({ error: "Randevu için giriş yapmalısın." }, 401);
  // A denied policy is still a successful policy read. Mutations return 403.
  return reply(await getCustomerBookingPolicy(client, user.id, selected.data.businessId));
}
