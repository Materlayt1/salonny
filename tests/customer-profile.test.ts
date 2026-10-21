import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createRequestClientOptional } from "@/lib/supabase/request";
import { GET, PATCH, DELETE } from "@/app/api/customer-profile/route";

vi.mock("@/lib/supabase/request", () => ({ createRequestClientOptional: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
// Authorization/RPC tests use isolated quota outcomes. The real limiter has its
// own fail-closed/distributed tests; cases here must not share an in-memory IP.
vi.mock("@/lib/rate-limit", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/rate-limit")>(),
  checkRateLimit: vi.fn(async () => ({ allowed: true, remaining: 2, resetAt: Date.now() + 600_000 })),
}));
const ownerId = "10000000-0000-4000-8000-000000000001";
const db = { full_name: "Müşteri", phone: "05555555555", city: "İzmir", id: ownerId, role: "CUSTOMER" };
const query = {
  select: vi.fn(), eq: vi.fn(), update: vi.fn(), insert: vi.fn(), maybeSingle: vi.fn(),
};
const from = vi.fn();
const rpc = vi.fn();
const request = (method: string, body?: unknown) => new Request("http://localhost:3001/api/customer-profile", { method, headers: { "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("MOBILE_ALLOWED_ORIGINS", "http://localhost:8082");
  for (const method of ["select", "eq", "update"] as const) query[method].mockReturnValue(query);
  query.insert.mockResolvedValue({ error: null });
  rpc.mockResolvedValue({ error: null, data: { requested: true, requestId: ownerId, status: "requested", withdrawnBusinessCount: 1 } });
  query.maybeSingle.mockResolvedValue({ data: db, error: null });
  from.mockReturnValue(query);
  vi.mocked(createRequestClientOptional).mockResolvedValue({ auth: { getUser: async () => ({ data: { user: { id: ownerId, email: "customer@example.com", user_metadata: {} } } }) }, from, rpc } as unknown as SupabaseClient);
});
afterEach(() => vi.unstubAllEnvs());

describe("customer profile authorization", () => {
  it("requires an authenticated user", async () => {
    vi.mocked(createRequestClientOptional).mockResolvedValue(null);
    expect((await GET(request("GET"))).status).toBe(401);
    expect(from).not.toHaveBeenCalled();
  });
  it("returns only the customer's public profile fields and never caches them", async () => {
    const response = await GET(request("GET"));
    expect(query.eq).toHaveBeenCalledWith("id", ownerId);
    expect(await response.json()).toEqual({ fullName: "Müşteri", phone: "05555555555", city: "İzmir", email: "customer@example.com" });
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it("scopes profile edits to the verified token owner", async () => {
    const response = await PATCH(request("PATCH", { fullName: "Yeni İsim", phone: "05555555555", city: "İzmir" }));
    expect(response.status).toBe(200);
    expect(query.eq).toHaveBeenCalledWith("id", ownerId);
    expect(query.update).toHaveBeenCalledWith({ full_name: "Yeni İsim", phone: "05555555555", city: "İzmir" });
  });
  it("rejects attempts to set another user's ID or elevate a role", async () => {
    const response = await PATCH(request("PATCH", { fullName: "Yeni İsim", phone: "05555555555", city: "İzmir", id: "another-user", role: "ADMIN" }));
    expect(response.status).toBe(422);
    expect(query.update).not.toHaveBeenCalled();
  });
  it.each([{ phone: "abc05555555555" }, { phone: "1".repeat(16) }, { fullName: "123456" }, { city: "not-a-city" }])("rejects invalid profile fields before DB access: %j", async (fields) => {
    const response = await PATCH(request("PATCH", { fullName: "Yeni İsim", phone: "05555555555", city: "İzmir", ...fields }));
    expect(response.status).toBe(422); expect(response.headers.get("cache-control")).toContain("no-store"); expect(query.update).not.toHaveBeenCalled();
  });
  it("requires explicit confirmation for deletion requests", async () => {
    expect((await DELETE(request("DELETE", { confirmed: false }))).status).toBe(422);
    expect(query.insert).not.toHaveBeenCalled();
  });
  it("never requests deletion without a verified authenticated user", async () => {
    vi.mocked(createRequestClientOptional).mockResolvedValue(null);
    expect((await DELETE(request("DELETE", { confirmed: true }))).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled(); expect(from).not.toHaveBeenCalled();
  });
  it("creates a deletion request only for the verified owner", async () => {
    const response = await DELETE(request("DELETE", { confirmed: true }));
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("request_account_deletion", { p_reason: null });
    expect(query.insert).not.toHaveBeenCalled();
    expect(await response.json()).toEqual({ requested: true, withdrawnBusinessCount: 1 });
  });
  it("never accepts a caller-supplied owner or incomplete acknowledgement", async () => {
    expect((await DELETE(request("DELETE", { confirmed: true, userId: "another" }))).status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
    rpc.mockResolvedValue({ error: null, data: { requested: true } });
    expect((await DELETE(request("DELETE", { confirmed: true }))).status).toBe(503);
  });
  it("returns a safe no-store uncertainty on RPC error, without automatic write retry", async () => {
    rpc.mockResolvedValue({ error: { message: "PRIVATE SQL" }, data: null });
    const response = await DELETE(request("DELETE", { confirmed: true }));
    expect(response.status).toBe(503); expect(response.headers.get("cache-control")).toContain("no-store"); expect(await response.text()).not.toContain("PRIVATE SQL"); expect(rpc).toHaveBeenCalledTimes(1);
  });
});
