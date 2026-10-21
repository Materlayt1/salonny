import { NextResponse } from "next/server";
import { z } from "zod";
import { createRequestClientOptional } from "@/lib/supabase/request";
import { apiRateLimit, readBoundedJson } from "@/lib/api-security";
import { parseNotificationQuery, readNotificationCount, readNotificationPage } from "@/lib/notification-history";

const bodySchema = z.object({ ids: z.array(z.uuid()).min(1).max(100).optional(), before: z.iso.datetime({ offset: true }).optional() }).strict().refine((value) => !(value.ids && value.before));
const reply = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
function privateResponse(response: Response) {
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export async function GET(request: Request) {
  try {
    const limited = await apiRateLimit(request, "notifications-read", 60, 60_000);
    if (limited) return privateResponse(limited);
    let parsed;
    try { parsed = parseNotificationQuery(request.url); } catch { return reply({ error: "Bildirim filtresi veya sayfası geçersiz." }, 422); }
    const client = await createRequestClientOptional(request);
    if (!client) return reply({ error: "Giriş yapmalısın." }, 401);
    const auth = await client.auth.getUser();
    if (auth.error && (auth.error.status === undefined || auth.error.status === 429 || auth.error.status >= 500)) throw auth.error;
    const user = auth.data.user;
    if (!user) return reply({ error: "Giriş yapmalısın." }, 401);
    if (parsed.summary) return reply({ unreadCount: await readNotificationCount(client, user.id), checkedAt: new Date().toISOString() });
    return reply(await readNotificationPage(client, user.id, parsed));
  } catch {
    return reply({ error: "Bildirimlere şu anda ulaşılamıyor. Yeniden dene." }, 503);
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await readBoundedJson(request, 16_384);
    if (!body.ok) return privateResponse(body.response);
    const limited = await apiRateLimit(request, "notifications", 30, 60_000, { critical: true, message: "Çok fazla işlem yaptınız." });
    if (limited) return privateResponse(limited);
    const parsed = bodySchema.safeParse(body.value);
    if (!parsed.success) return reply({ error: "Bildirim seçimi geçersiz." }, 422);
    const supabase = await createRequestClientOptional(request);
    if (!supabase) return reply({ error: "Veritabanı bağlantısı yapılandırılmamış." }, 503);
    const auth = await supabase.auth.getUser();
    if (auth.error && (auth.error.status === undefined || auth.error.status === 429 || auth.error.status >= 500)) throw auth.error;
    const user = auth.data.user;
    if (!user) return reply({ error: "Oturum açmanız gerekiyor." }, 401);
    const readAt = new Date().toISOString();
    if (parsed.data.before && Date.parse(parsed.data.before) > Date.parse(readAt)) return reply({ error: "Bildirim tarihi geçersiz." }, 422);
    let query = supabase.from("notifications").update({ read_at: readAt }).eq("user_id", user.id).is("read_at", null);
    if (parsed.data.ids?.length) query = query.in("id", parsed.data.ids);
    else query = query.lte("created_at", parsed.data.before ?? readAt);
    const { error } = await query;
    if (error) return reply({ error: "Bildirimler güncellenemedi." }, 503);
    return reply({ readAt });
  } catch {
    return reply({ error: "Bildirimler şu anda güncellenemiyor. Yeniden dene." }, 503);
  }
}
