import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/auth/supabase/[...path]/route";
import { safeAuthDestination } from "@/lib/auth/redirect";

const { eventMock } = vi.hoisted(() => ({ eventMock: vi.fn() }));
vi.mock("@/lib/observability", () => ({ emitEvent: eventMock }));

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
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  eventMock.mockReset().mockResolvedValue(undefined);
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
    const response = await POST(request("https://attacker.example"), context("token"));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "origin_not_allowed", error_code: "origin_not_allowed" });
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
    expect(eventMock).toHaveBeenCalledWith("warn", { event: "auth_proxy_rejected", endpoint: "token", status: 503, code: "service_unavailable", stage: "connection" });
  });
  it("preserves the versioned SDK protocol and upstream retry headers", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ code: "over_request_rate_limit" }), {
      status: 429, headers: { "X-Supabase-Api-Version": "2024-01-01", "Retry-After": "30" },
    }));
    const incoming = request();
    incoming.headers.set("X-Supabase-Api-Version", "2024-01-01");
    const response = await POST(incoming, context("token"));
    expect(new Headers(fetchMock.mock.calls[0][1].headers).get("X-Supabase-Api-Version")).toBe("2024-01-01");
    expect(response.headers.get("X-Supabase-Api-Version")).toBe("2024-01-01");
    expect(response.headers.get("Retry-After")).toBe("30");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.status).toBe(429);
  });
  it("rejects malformed request versions before contacting the provider", async () => {
    const incoming = request();
    incoming.headers.set("X-Supabase-Api-Version", "not-a-version");
    const response = await POST(incoming, context("token"));
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ code: "invalid_auth_request", error_code: "invalid_auth_request" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("does not forward an invalid provider version or unrelated headers", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 200, headers: {
      "X-Supabase-Api-Version": "invalid", "Set-Cookie": "fixture-cookie", "X-Internal-Trace": "fixture-trace",
    } }));
    const response = await POST(request(), context("token"));
    expect(response.headers.get("X-Supabase-Api-Version")).toBeNull();
    expect(response.headers.get("Set-Cookie")).toBeNull();
    expect(response.headers.get("X-Internal-Trace")).toBeNull();
  });
  it("keeps unavailable production protection fail-closed and SDK-readable", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const response = await POST(request(), context("token"));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: "service_unavailable", error_code: "service_unavailable" });
    expect(response.headers.get("Retry-After")).toBe("5");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(eventMock).toHaveBeenCalledWith("warn", { event: "auth_proxy_rejected", endpoint: "token", status: 503, code: "service_unavailable", stage: "rate_limit" });
  });
  it("keeps local rate-limit metadata while normalizing the error body", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(new Response("{}", { status: 200 })));
    const agent = crypto.randomUUID();
    const nextRequest = () => {
      const incoming = request();
      incoming.headers.set("User-Agent", agent);
      return incoming;
    };
    for (let index = 0; index < 20; index++) expect((await POST(nextRequest(), context("token"))).status).toBe(200);
    const response = await POST(nextRequest(), context("token"));
    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({ code: "over_request_rate_limit", error_code: "over_request_rate_limit" });
    expect(Number(response.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(response.headers.get("X-RateLimit-Limit")).toBe("20");
    expect(response.headers.get("X-RateLimit-Remaining")).toBe("0");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(fetchMock).toHaveBeenCalledTimes(20);
  });
  it("records only sanitized error metadata, never identifiers or credentials", async () => {
    const payload = { code: "customer@example.com:test-token", msg: "private-provider-error", access_token: "test-token" };
    fetchMock.mockResolvedValue(new Response(JSON.stringify(payload), { status: 400 }));
    await POST(request(), context("token"));
    expect(eventMock.mock.calls).toEqual([["warn", { event: "auth_proxy_rejected", endpoint: "token", status: 400, code: "unknown", stage: "upstream" }]]);
    const recorded = JSON.stringify(eventMock.mock.calls);
    for (const secret of ["customer@example.com", "invalid-test-password", "public-test-key", "test-token", "private-provider-error"]) {
      expect(recorded).not.toContain(secret);
    }
  });
  it("supports bodyless logout requests", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    const response = await POST(new Request("http://localhost:3001/api/auth/supabase/logout", { method: "POST" }), context("logout"));
    expect(response.status).toBe(204);
  });
});
