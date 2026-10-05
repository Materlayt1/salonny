import { NextResponse } from "next/server";
import { z } from "zod";
import { createRequestClientOptional } from "@/lib/supabase/request";
import { apiRateLimit, readBoundedJson } from "@/lib/api-security";

const bodySchema = z.object({ ids: z.array(z.uuid()).max(100).optional() });

export async function GET(request: Request) {
  const limited = await apiRateLimit(request, "notifications-read", 60, 60_000);
  if (limited) return limited;
  const client = await createRequestClientOptional(request);
  const user = client ? (await client.auth.getUser()).data.user : null;
  if (!client || !user) return NextResponse.json({ error: "Giriş yapmalısın." }, { status: 401 });
  const { data, error } = await client.from("notifications").select("id,title,body,read_at,created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(100);
  if (error) return NextResponse.json({ error: "Bildirimler alınamadı." }, { status: 503 });
  return NextResponse.json({ notifications: (data ?? []).map((row) => ({ id: row.id, title: row.title, body: row.body, readAt: row.read_at, createdAt: row.created_at })) }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PATCH(request: Request) {
  const body = await readBoundedJson(request, 16_384);
  if (!body.ok) return body.response;
  const limited = await apiRateLimit(request, "notifications", 30, 60_000, { critical: true, message: "Çok fazla işlem yaptınız." });
  if (limited) return limited;
  const parsed = bodySchema.safeParse(body.value);
  if (!parsed.success) return NextResponse.json({ error: "Bildirim seçimi geçersiz." }, { status: 422 });
  const supabase = await createRequestClientOptional(request);
  if (!supabase) return NextResponse.json({ error: "Veritabanı bağlantısı yapılandırılmamış." }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Oturum açmanız gerekiyor." }, { status: 401 });
  const readAt = new Date().toISOString();
  let query = supabase.from("notifications").update({ read_at: readAt }).eq("user_id", user.id).is("read_at", null);
  if (parsed.data.ids?.length) query = query.in("id", parsed.data.ids);
  const { error } = await query;
  if (error) return NextResponse.json({ error: "Bildirimler güncellenemedi." }, { status: 400 });
  return NextResponse.json({ readAt });
}
