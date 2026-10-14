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
const result = () => ({ data: [{ id, type: "appointment_confirmed", title: "Randevunuz onaylandı", body: "Bilgi", read_at: null, created_at: "2026-10-14T09:00:00Z", appointment_id: id, business_id: businessId, appointments: { branch_id: branchId }, businesses: { slug: "gogo" } }], error });
const builder = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), limit: vi.fn(), update: vi.fn(), is: vi.fn(), in: vi.fn(), then: (resolve: (value: ReturnType<typeof result>) => unknown) => Promise.resolve(result()).then(resolve) };
const client = { from: vi.fn(() => builder), auth: { getUser: vi.fn() } };
beforeEach(() => {
  vi.clearAllMocks(); error = null;
  for (const method of [builder.select, builder.eq, builder.order, builder.limit, builder.update, builder.is, builder.in]) method.mockReturnValue(builder);
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
    expect(builder.select).toHaveBeenCalledWith(notificationColumns); expect(builder.eq).toHaveBeenCalledWith("user_id", userId); expect(builder.limit).toHaveBeenCalledWith(100);
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
    expect((await PATCH(write({ ids: [id] }))).status).toBe(400);
  });
});
