import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { validNotificationTime, type NotificationFilters, type NotificationPage } from "@salonny/contracts";
import { mapNotification, notificationColumns } from "@/lib/notifications";

const timestamp = z.string().refine(validNotificationTime);
const cursorSchema = z.object({ v: z.literal(1), at: timestamp, id: z.uuid(), before: timestamp, kind: z.enum(["all", "appointment", "campaign", "review"]), unread: z.boolean() }).strict();
const querySchema = z.object({ kind: z.enum(["all", "appointment", "campaign", "review"]).default("all"), unread: z.enum(["true", "false"]).default("false"), cursor: z.string().min(1).max(1024).optional(), summary: z.literal("1").optional() }).strict();
export const notificationPageSize = 25;

export function parseNotificationQuery(url: string) {
  const params = new URL(url).searchParams;
  if (new Set(params.keys()).size !== [...params.keys()].length) throw new Error("Duplicate query");
  const data = querySchema.parse(Object.fromEntries(params));
  if (data.summary && (params.size !== 1)) throw new Error("Invalid summary query");
  const filters: NotificationFilters = { kind: data.kind, unread: data.unread === "true" };
  const cursor = data.cursor ? cursorSchema.parse(JSON.parse(Buffer.from(data.cursor, "base64url").toString("utf8"))) : null;
  if (cursor && (cursor.kind !== filters.kind || cursor.unread !== filters.unread || Date.parse(cursor.at) > Date.parse(cursor.before) || Date.parse(cursor.before) > Date.now() + 1000)) throw new Error("Invalid cursor scope");
  return { filters, cursor, summary: Boolean(data.summary) };
}

export async function readNotificationCount(client: SupabaseClient, userId: string) {
  const result = await client.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", userId).is("read_at", null);
  if (result.error || !Number.isSafeInteger(result.count) || result.count! < 0) throw new Error("Notification count unavailable");
  return result.count!;
}

export async function readNotificationPage(client: SupabaseClient, userId: string, parsed = parseNotificationQuery("http://local/")): Promise<NotificationPage> {
  const { filters, cursor } = parsed;
  const before = cursor?.before ?? new Date().toISOString();
  let query = client.from("notifications").select(notificationColumns).eq("user_id", userId).lte("created_at", before);
  if (filters.unread) query = query.is("read_at", null);
  // All expressions are fixed strings or strictly validated timestamp/UUIDs.
  if (filters.kind === "appointment") query = query.or("type.like.*appointment*,type.like.*reminder*");
  if (filters.kind === "campaign") query = query.or("type.like.*campaign*,type.like.*offer*,type.like.*discount*");
  if (filters.kind === "review") query = query.like("type", "%review%");
  if (filters.kind === "appointment" || filters.kind === "review") {
    for (const word of ["campaign", "offer", "discount"]) query = query.not("type", "like", `%${word}%`);
  }
  if (filters.kind === "appointment") query = query.not("type", "like", "%review%");
  if (cursor) query = query.or(`created_at.lt.${cursor.at},and(created_at.eq.${cursor.at},id.lt.${cursor.id})`);
  const [result, unreadCount] = await Promise.all([
    query.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(notificationPageSize + 1),
    readNotificationCount(client, userId),
  ]);
  if (result.error || !result.data) throw new Error("Notifications unavailable");
  const rows = result.data.slice(0, notificationPageSize);
  const last = rows.at(-1);
  const nextCursor = result.data.length > notificationPageSize && last ? Buffer.from(JSON.stringify({ v: 1, at: last.created_at, id: last.id, before, ...filters })).toString("base64url") : null;
  return { notifications: rows.map(mapNotification), nextCursor, before, unreadCount };
}
