import { NextResponse } from "next/server";
import { apiRateLimit, readBoundedJson } from "@/lib/api-security";
import { createRequestClientOptional } from "@/lib/supabase/request";
import { customerAddressSchema } from "@/lib/customer-profile-contract";

const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
export async function POST(request: Request) {
  const body = await readBoundedJson(request, 8192);
  if (!body.ok) return body.response;
  const parsed = customerAddressSchema.safeParse(body.value);
  if (!parsed.success) return reply({ error: parsed.error.issues[0]?.message ?? "Adres alanlarını kontrol et." }, 422);
  const limited = await apiRateLimit(request, "customer-address-write", 12, 60_000, { critical: true });
  if (limited) return limited;
  const client = await createRequestClientOptional(request);
  const user = client ? (await client.auth.getUser()).data.user : null;
  if (!client || !user) return reply({ error: "Giriş yapmalısın." }, 401);
  const existing = await client.from("user_addresses").select("id", { count: "exact", head: true }).eq("user_id", user.id);
  if (existing.error || existing.count === null) return reply({ error: "Adreslerin kontrol edilemedi. Tekrar dene." }, 503);
  const value = parsed.data;
  const result = await client.from("user_addresses").insert({ user_id: user.id, label: value.label, recipient_name: value.recipientName, phone: value.phone || null, address_line: value.addressLine, city: value.city, district: value.district, postal_code: value.postalCode || null, is_default: existing.count === 0 }).select("id").single();
  if (result.error || !result.data) return reply({ error: "Adres eklenemedi. Alanları kontrol edip tekrar dene." }, 400);
  if (value.isDefault && existing.count > 0) {
    const change = await client.rpc("set_default_user_address", { p_address_id: result.data.id });
    if (change.error) return reply({ saved: true, warning: "Adres eklendi ancak varsayılan yapılamadı. Adres kartından yeniden deneyebilirsin." }, 201);
  }
  return reply({ saved: true }, 201);
}
