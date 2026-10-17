import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, PATCH } from "@/app/api/notifications/route";
import { createRequestClientOptional } from "@/lib/supabase/request";
import { apiRateLimit } from "@/lib/api-security";
import { notificationColumns } from "@/lib/notifications";

vi.mock("@/lib/supabase/request", () => ({ createRequestClientOptional: vi.fn() }));
vi.mock("@/lib/api-security", async (original) => ({ ...await original<typeof import("@/lib/api-security")>(), apiRateLimit: vi.fn() }));
const userId = "10000000-0000-4000-8000-000000000001";
const id = "10000000-0000-4000-8000-000000000002";
const businessId = "10000000-0000-4000-8000-000000000003";
const branchId = "10000000-0000-4000-8000-000000000004";
const read = () => new Request("http://localhost/api/notifications", { headers: { authorization: "Bearer fixture" } });
const write = (body: unknown = {}) => new Request("http://localhost/api/notifications", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
let error: { message: string } | null;
let count: number | null;
const row = { id, type: "appointment_confirmed", title: "Randevunuz onaylandı", body: "Bilgi", read_at: null, created_at: "2026-10-14T09:00:00.123456+00:00", appointment_id: id, business_id: businessId, appointments: { branch_id: branchId }, businesses: { slug: "gogo" } };
let rows = [row];
const result = () => ({ data: rows, count, error });
const builder = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), limit: vi.fn(), update: vi.fn(), is: vi.fn(), in: vi.fn(), lte: vi.fn(), or: vi.fn(), like: vi.fn(), not: vi.fn(), then: (resolve: (value: ReturnType<typeof result>) => unknown) => Promise.resolve(result()).then(resolve) };
const client = { from: vi.fn(() => builder), auth: { getUser: vi.fn() } };
beforeEach(() => {
  vi.clearAllMocks(); error = null; count = 1; rows = [row];
  for (const method of [builder.select, builder.eq, builder.order, builder.limit, builder.update, builder.is, builder.in, builder.lte, builder.or, builder.like, builder.not]) method.mockReturnValue(builder);
  client.auth.getUser.mockResolvedValue({ data: { user: { id: userId } } });
  vi.mocked(createRequestClientOptional).mockResolvedValue(client as unknown as NonNullable<Awaited<ReturnType<typeof createRequestClientOptional>>>);
  vi.mocked(apiRateLimit).mockResolvedValue(null);
});

describe("notifications authenticated API", () => {
  it("returns bounded own notices with safe navigation metadata and no private JSON", async () => {
    const request = read(); const response = await GET(request);
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store");
    const payload = await response.json(); expect(payload.notifications[0]).toMatchObject({ appointmentId: id, businessId, branchId, businessSlug: "gogo", type: "appointment_confirmed" });
    expect(payload.notifications[0]).not.toHaveProperty("data"); expect(payload.notifications[0]).not.toHaveProperty("user_id");
    expect(createRequestClientOptional).toHaveBeenCalledWith(request);
    expect(builder.select).toHaveBeenCalledWith(notificationColumns); expect(builder.eq).toHaveBeenCalledWith("user_id", userId); expect(builder.limit).toHaveBeenCalledWith(26);
    expect(builder.order).toHaveBeenCalledWith("id", { ascending: false }); expect(payload.nextCursor).toBeNull(); expect(payload.unreadCount).toBe(1);
  });
  it("rejects anonymous read and write without querying notices", async () => {
    client.auth.getUser.mockResolvedValue({ data: { user: null } });
    expect((await GET(read())).status).toBe(401); expect((await PATCH(write({ ids: [id] }))).status).toBe(401); expect(client.from).not.toHaveBeenCalled();
  });
  it("updates only the selected unread notice belonging to the current actor", async () => {
    expect((await PATCH(write({ ids: [id] }))).status).toBe(200);
    expect(builder.eq).toHaveBeenCalledWith("user_id", userId); expect(builder.is).toHaveBeenCalledWith("read_at", null); expect(builder.in).toHaveBeenCalledWith("id", [id]);
    expect(builder.update.mock.calls[0][0]).toEqual({ read_at: expect.any(String) });
  });
  it("marks all only for an explicit request without ids", async () => {
    expect((await PATCH(write())).status).toBe(200); expect(builder.in).not.toHaveBeenCalled();
    expect(builder.lte).toHaveBeenCalledWith("created_at", expect.any(String));
  });
  it("keeps the page cutoff for mark-all, rather than consuming newly arrived notices", async () => {
    const before = "2026-10-14T09:00:00.123456+00:00";
    expect((await PATCH(write({ before }))).status).toBe(200);
    expect(builder.lte).toHaveBeenCalledWith("created_at", before);
  });
  it.each([{ ids: [id], before: "2026-10-14T09:00:00Z" }, { before: "bad" }, { before: "2099-01-01T00:00:00Z" }])("rejects unsafe mark-all scope %j", async (body) => {
    expect((await PATCH(write(body))).status).toBe(422); expect(builder.update).not.toHaveBeenCalled();
  });
  it("pages by timestamp and UUID without losing PostgreSQL microseconds", async () => {
    rows = Array.from({ length: 26 }, (_, i) => ({ ...row, id: `10000000-0000-4000-8000-${String(100 - i).padStart(12, "0")}` }));
    const first = await (await GET(read())).json();
    expect(first.notifications).toHaveLength(25); expect(first.nextCursor).toEqual(expect.any(String));
    const next = new Request("http://localhost/api/notifications?cursor=" + first.nextCursor);
    expect((await GET(next)).status).toBe(200);
    expect(builder.or).toHaveBeenCalledWith(`created_at.lt.${row.created_at},and(created_at.eq.${row.created_at},id.lt.${rows[24].id})`);
    expect(builder.lte).toHaveBeenLastCalledWith("created_at", first.before);
    expect((await GET(new Request(next.url + "&unread=true"))).status).toBe(422);
  });
  it.each(["kind=evil", "unread=1", "kind=all&kind=review", "userId=other", "summary=1&unread=true", "cursor=bad", "cursor=" + "x".repeat(1025)])("rejects malformed query before database access: %s", async (query) => {
    expect((await GET(new Request("http://localhost/api/notifications?" + query))).status).toBe(422); expect(client.from).not.toHaveBeenCalled();
  });
  it.each(["appointment", "campaign", "review"])("filters %s in the database before limiting", async (kind) => {
    expect((await GET(new Request(`http://localhost/api/notifications?kind=${kind}&unread=true`))).status).toBe(200);
    expect(builder.is).toHaveBeenCalledWith("read_at", null); expect(builder.like.mock.calls.length + builder.or.mock.calls.length).toBeGreaterThan(0);
  });
  it("count-only reads are owner-scoped and do not retrieve notification bodies", async () => {
    const response = await GET(new Request("http://localhost/api/notifications?summary=1"));
    expect(await response.json()).toEqual({ unreadCount: 1, checkedAt: expect.any(String) });
    expect(builder.select).not.toHaveBeenCalledWith(notificationColumns); expect(builder.eq).toHaveBeenCalledWith("user_id", userId);
  });
  it("a missing count is a service error, never a fabricated zero", async () => {
    count = null;
    for (const query of ["", "?summary=1"]) expect((await GET(new Request("http://localhost/api/notifications" + query))).status).toBe(503);
  });
  it.each([{ ids: [] }, { ids: ["bad"] }, { ids: Array(101).fill(id) }, { ids: [id], userId: businessId }, { ids: [id], readAt: "fake" }])("refuses empty/invalid/over-scoped read receipts: %j", async (body) => {
    expect((await PATCH(write(body))).status).toBe(422); expect(client.from).not.toHaveBeenCalled();
  });
  it("keeps read/write rate limits before private access", async () => {
    vi.mocked(apiRateLimit).mockResolvedValue(new Response(null, { status: 429 }) as Awaited<ReturnType<typeof apiRateLimit>>);
    expect((await GET(read())).status).toBe(429); expect((await PATCH(write())).status).toBe(429); expect(createRequestClientOptional).not.toHaveBeenCalled();
  });
  it("does not leak database errors", async () => {
    error = { message: "sensitive SQL/user payload" }; const response = await GET(read()); expect(response.status).toBe(503); expect(JSON.stringify(await response.json())).not.toContain("sensitive");
    expect((await PATCH(write({ ids: [id] }))).status).toBe(503);
  });
  it("keeps anonymous, validation, database, limiter and successful receipt responses private", async () => {
    const responses = [await GET(read()), await PATCH(write({ ids: [id] })), await PATCH(write({ ids: [] }))];
    error = { message: "PRIVATE SQL" }; responses.push(await GET(read()), await PATCH(write())); error = null;
    client.auth.getUser.mockResolvedValue({ data: { user: null } }); responses.push(await GET(read()), await PATCH(write()));
    vi.mocked(apiRateLimit).mockImplementation(async () => new Response(null, { status: 429 }) as Awaited<ReturnType<typeof apiRateLimit>>);
    responses.push(await GET(read()), await PATCH(write()));
    for (const response of responses) expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
  it.each([429, 500, 503, undefined])("Auth transport/service error %s is retryable, not a false sign-out", async (status) => {
    client.auth.getUser.mockResolvedValue({ data: { user: null }, error: { status, message: "PRIVATE AUTH" } });
    for (const response of [await GET(read()), await PATCH(write())]) { expect(response.status).toBe(503); expect(response.headers.get("cache-control")).toBe("private, no-store"); expect(JSON.stringify(await response.json())).not.toContain("PRIVATE"); }
    expect(client.from).not.toHaveBeenCalled();
  });
  it("unexpected Auth failure stays JSON, private and retryable without a write", async () => {
    client.auth.getUser.mockRejectedValue(new Error("PRIVATE TRANSPORT"));
    for (const response of [await GET(read()), await PATCH(write())]) { expect(response.status).toBe(503); expect(response.headers.get("cache-control")).toBe("private, no-store"); expect(JSON.stringify(await response.json())).not.toContain("PRIVATE"); }
    expect(client.from).not.toHaveBeenCalled();
  });
  it("body rejection is also private and cannot reach the database", async () => {
    const request = new Request("http://localhost/api/notifications", { method: "PATCH", headers: { origin: "https://untrusted.invalid", "content-type": "application/json" }, body: "{}" });
    const response = await PATCH(request); expect(response.status).toBe(403); expect(response.headers.get("cache-control")).toBe("private, no-store"); expect(client.from).not.toHaveBeenCalled();
  });
});
