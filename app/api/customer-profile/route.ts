import { NextResponse } from "next/server";
import { z } from "zod";
import { apiRateLimit, readBoundedJson } from "@/lib/api-security";
import { createRequestClientOptional } from "@/lib/supabase/request";
import { customerProfileSchema } from "@/lib/customer-profile-contract";
import { AccountDeletionError, requestAccountDeletion } from "@/lib/account-deletion";

export async function GET(request: Request) {
  const limited = await apiRateLimit(request, "customer-profile-read", 60, 60_000);
  if (limited) return limited;
  const client = await createRequestClientOptional(request);
  const user = client ? (await client.auth.getUser()).data.user : null;
  if (!client || !user) return NextResponse.json({ error: "Giriş yapmalısın." }, { status: 401 });
  const { data, error } = await client.from("users").select("full_name,phone,city").eq("id", user.id).maybeSingle();
  if (error) return NextResponse.json({ error: "Profil alınamadı." }, { status: 503 });
  return NextResponse.json({ fullName: data?.full_name ?? user.user_metadata.full_name ?? "", phone: data?.phone ?? "", city: data?.city ?? "", email: user.email }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PATCH(request: Request) {
  const body = await readBoundedJson(request, 4096);
  if (!body.ok) return body.response;
  const parsed = customerProfileSchema.safeParse(body.value);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Ad soyad, telefon ve şehir bilgilerini kontrol et." }, { status: 422, headers: { "Cache-Control": "private, no-store" } });
  const limited = await apiRateLimit(request, "customer-profile-write", 12, 60_000, { critical: true });
  if (limited) return limited;
  const client = await createRequestClientOptional(request);
  const user = client ? (await client.auth.getUser()).data.user : null;
  if (!client || !user) return NextResponse.json({ error: "Giriş yapmalısın." }, { status: 401 });
  const { error, data } = await client.from("users").update({ full_name: parsed.data.fullName, phone: parsed.data.phone || null, city: parsed.data.city || null }).eq("id", user.id).select("id").maybeSingle();
  if (error || !data) return NextResponse.json({ error: "Profil güncellenemedi." }, { status: 400 });
  return NextResponse.json({ saved: true }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function DELETE(request: Request) {
  const body = await readBoundedJson(request, 4096);
  if (!body.ok) return body.response;
  const parsed = z.object({ confirmed: z.literal(true), reason: z.string().trim().max(1000).optional() }).strict().safeParse(body.value);
  if (!parsed.success) {
    return NextResponse.json({ error: "Silme talebini onaylamalısın." }, { status: 422 });
  }
  const limited = await apiRateLimit(request, "account-deletion-request", 3, 600_000, { critical: true });
  if (limited) return limited;
  const client = await createRequestClientOptional(request);
  const user = client ? (await client.auth.getUser()).data.user : null;
  if (!client || !user) return NextResponse.json({ error: "Giriş yapmalısın." }, { status: 401 });
  try {
    return NextResponse.json(await requestAccountDeletion(client, parsed.data.reason), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof AccountDeletionError ? error.message : "Talep sonucu doğrulanamadı. Yeniden denemeden önce profilini yenile." }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}
