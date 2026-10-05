import { NextResponse } from "next/server";
import { z } from "zod";
import { apiRateLimit, readBoundedJson } from "@/lib/api-security";
import { createRequestClientOptional } from "@/lib/supabase/request";

const profileSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(24).refine((value) => !value || value.replace(/\D/g, "").length >= 10),
  city: z.string().trim().max(80),
}).strict();

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
  const parsed = profileSchema.safeParse(body.value);
  if (!parsed.success) return NextResponse.json({ error: "Ad soyad, telefon ve şehir bilgilerini kontrol et." }, { status: 422 });
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
  if (!z.object({ confirmed: z.literal(true) }).strict().safeParse(body.value).success) {
    return NextResponse.json({ error: "Silme talebini onaylamalısın." }, { status: 422 });
  }
  const limited = await apiRateLimit(request, "account-deletion-request", 3, 600_000, { critical: true });
  if (limited) return limited;
  const client = await createRequestClientOptional(request);
  const user = client ? (await client.auth.getUser()).data.user : null;
  if (!client || !user) return NextResponse.json({ error: "Giriş yapmalısın." }, { status: 401 });
  const { error } = await client.from("account_deletion_requests").insert({ user_id: user.id, reason: "Mobil uygulamadan talep edildi.", status: "requested" });
  if (error && error.code !== "23505") return NextResponse.json({ error: "Talep kaydedilemedi." }, { status: 400 });
  return NextResponse.json({ requested: true }, { headers: { "Cache-Control": "private, no-store" } });
}
