import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createRequestClientOptional } from "@/lib/supabase/request";
import { GET, PATCH, DELETE } from "@/app/api/customer-profile/route";

vi.mock("@/lib/supabase/request", () => ({ createRequestClientOptional: vi.fn() }));
const ownerId = "10000000-0000-4000-8000-000000000001";
const db = { full_name: "Müşteri", phone: "05555555555", city: "İzmir", id: ownerId, role: "CUSTOMER" };
const query = {
  select: vi.fn(), eq: vi.fn(), update: vi.fn(), insert: vi.fn(), maybeSingle: vi.fn(),
};
const from = vi.fn();
const request = (method: string, body?: unknown) => new Request("http://localhost:3001/api/customer-profile", { method, headers: { "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("MOBILE_ALLOWED_ORIGINS", "http://localhost:8082");
  for (const method of ["select", "eq", "update"] as const) query[method].mockReturnValue(query);
  query.insert.mockResolvedValue({ error: null });
  query.maybeSingle.mockResolvedValue({ data: db, error: null });
  from.mockReturnValue(query);
  vi.mocked(createRequestClientOptional).mockResolvedValue({ auth: { getUser: async () => ({ data: { user: { id: ownerId, email: "customer@example.com", user_metadata: {} } } }) }, from } as unknown as SupabaseClient);
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
  it("requires explicit confirmation for deletion requests", async () => {
    expect((await DELETE(request("DELETE", { confirmed: false }))).status).toBe(422);
    expect(query.insert).not.toHaveBeenCalled();
  });
  it("creates a deletion request only for the verified owner", async () => {
    const response = await DELETE(request("DELETE", { confirmed: true }));
    expect(response.status).toBe(200);
    expect(query.insert).toHaveBeenCalledWith(expect.objectContaining({ user_id: ownerId, status: "requested" }));
  });
});
