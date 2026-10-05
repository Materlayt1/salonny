import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/auth/supabase/[...path]/route";
import { safeAuthDestination } from "@/lib/auth/redirect";

const fetchMock = vi.fn();
const context = (endpoint: string) => ({ params: Promise.resolve({ path: endpoint.split("/") }) });
const request = (origin = "http://localhost:8082", body = { email: "customer@example.com", password: "invalid-test-password" }) => new Request("http://localhost:3001/api/auth/supabase/token?grant_type=password", {
  method: "POST", headers: { origin, "content-type": "application/json", authorization: "Bearer public-test-key" }, body: JSON.stringify(body),
});

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test-project.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "public-test-key");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_OFFLINE", "false");
  vi.stubEnv("MOBILE_ALLOWED_ORIGINS", "http://localhost:8082");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("mobile auth gateway", () => {
  it("prevents protocol-relative and backslash login redirects", () => {
    expect(safeAuthDestination("/profile?tab=personal")).toBe("/profile?tab=personal");
    for (const next of ["//attacker.example", "/\\attacker.example", "/\n/attacker.example", "https://attacker.example"]) {
      expect(safeAuthDestination(next, "/profile")).toBe("/profile");
    }
  });
  it("forwards password login to the fixed project and preserves the session payload without caching", async () => {
    const session = { access_token: "test-token", refresh_token: "test-refresh", user: { id: "test-user" } };
    fetchMock.mockResolvedValue(new Response(JSON.stringify(session), { status: 200 }));
    const response = await POST(request(), context("token"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(session);
    expect(response.headers.get("cache-control")).toContain("no-store");
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://test-project.supabase.co/auth/v1/token?grant_type=password");
    expect(init.headers.apikey).toBe("public-test-key");
    expect(init.redirect).toBe("error");
    expect(JSON.parse(init.body).password).toBe("invalid-test-password");
  });
  it("preserves invalid-credential errors for the SDK", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error_code: "invalid_credentials" }), { status: 400 }));
    const response = await POST(request(), context("token"));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error_code: "invalid_credentials" });
  });
  it("rejects untrusted origins before contacting Supabase", async () => {
    expect((await POST(request("https://attacker.example"), context("token"))).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("does not expose arbitrary backend or admin endpoints", async () => {
    expect((await GET(new Request("http://localhost:3001/api/auth/supabase/admin/users"), context("admin/users"))).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("bounds authentication payloads", async () => {
    const response = await POST(request("http://localhost:8082", { email: "a@example.com", password: "x".repeat(20_000) }), context("token"));
    expect(response.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("returns a retryable service error for network failures", async () => {
    fetchMock.mockRejectedValue(new Error("TLS failure"));
    const response = await POST(request(), context("token"));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: "service_unavailable" });
  });
  it("supports bodyless logout requests", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    const response = await POST(new Request("http://localhost:3001/api/auth/supabase/logout", { method: "POST" }), context("logout"));
    expect(response.status).toBe(204);
  });
});
