import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { parseNotificationQuery, readNotificationPage } from "@/lib/notification-history";
import { notificationQuery, parseNotificationPage, parseNotificationSummary } from "@salonny/contracts";

const id = "10000000-0000-4000-8000-000000000002";
describe("shared notification history contract", () => {
  it("combines type, unread, cutoff and keyset predicates in the real PostgREST client", async () => {
    const urls: URL[] = [];
    const client = createClient("https://fixture.supabase.co", "fixture-key", { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: async (url, options) => {
      urls.push(new URL(String(url)));
      return new Response(options?.method === "HEAD" ? null : "[]", { headers: { "content-type": "application/json", "content-range": "*/0" } });
    } } });
    const cursor = Buffer.from(JSON.stringify({ v: 1, at: "2026-10-14T09:00:00.123456+00:00", id, before: "2026-10-14T10:00:00Z", kind: "appointment", unread: true })).toString("base64url");
    const page = await readNotificationPage(client, id, parseNotificationQuery("http://local/?" + notificationQuery({ kind: "appointment", unread: true }, cursor)));
    expect(page.notifications).toEqual([]); expect(page.unreadCount).toBe(0);
    const query = urls.find((url) => url.searchParams.get("limit"))!.searchParams;
    expect(query.getAll("or")).toEqual(["(type.like.*appointment*,type.like.*reminder*)", `(created_at.lt.2026-10-14T09:00:00.123456+00:00,and(created_at.eq.2026-10-14T09:00:00.123456+00:00,id.lt.${id}))`]);
    expect(query.get("order")).toBe("created_at.desc,id.desc"); expect(query.get("user_id")).toBe(`eq.${id}`);
    expect(query.get("read_at")).toBe("is.null"); expect(query.get("limit")).toBe("26");
  });
  it.each(["bad,or(id.gt.0)", "2026-10-14T09:00:00Z),user_id.neq.x", "2026-10-14 09:00:00"])("rejects cursor predicate injection %s", (at) => {
    const cursor = Buffer.from(JSON.stringify({ v: 1, at, id, before: "2026-10-14T10:00:00Z", kind: "all", unread: false })).toString("base64url");
    expect(() => parseNotificationQuery("http://local/?cursor=" + cursor)).toThrow();
  });
  it("validates empty history without pretending malformed payloads are empty", () => {
    const page = { notifications: [], nextCursor: null, unreadCount: 0, before: "2026-10-14T10:00:00Z" };
    expect(parseNotificationPage(page)).toEqual(page);
    for (const value of [null, {}, { notifications: [] }, { ...page, unreadCount: -1 }, { ...page, notifications: [{ id: "bad" }] }, { ...page, nextCursor: "" }]) expect(() => parseNotificationPage(value)).toThrow();
    expect(() => parseNotificationSummary({ unreadCount: null, checkedAt: page.before })).toThrow();
    expect(() => parseNotificationSummary({ unreadCount: 0, checkedAt: "invalid" })).toThrow();
  });
});
