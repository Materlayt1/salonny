import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerClientOptional } from "@/lib/supabase/server";
import { apiRateLimit, readBoundedJson } from "@/lib/api-security";

const bodySchema = z.object({ ids: z.array(z.uuid()).max(100).optional() });

export async function PATCH(request: Request) {
  const body = await readBoundedJson(request, 16_384);
  if (!body.ok) return body.response;
  const limited = await apiRateLimit(request, "notifications", 30, 60_000, { critical: true, message: "Çok fazla işlem yaptınız." });
  if (limited) return limited;
  const parsed = bodySchema.safeParse(body.value);
  if (!parsed.success) return NextResponse.json({ error: "Bildirim seçimi geçersiz." }, { status: 422 });
  const supabase = await createServerClientOptional();
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
