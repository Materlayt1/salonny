import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/health/ready/route";

const { createPublicClient } = vi.hoisted(() => ({ createPublicClient: vi.fn() }));
vi.mock("@/lib/supabase/public", () => ({ createPublicSupabaseClientOptional: createPublicClient }));
const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://db-fixture.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "public-fixture-key");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_OFFLINE", "false");
  for (const name of ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_URL", "KV_REST_API_TOKEN", "KV_REST_API_READ_ONLY_TOKEN"]) vi.stubEnv(name, "");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  const query = { select: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(), abortSignal: vi.fn().mockResolvedValue({ error: null }) };
  createPublicClient.mockReset().mockReturnValue({ from: vi.fn().mockReturnValue(query) });
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("production readiness with native Redis integration", () => {
  it("reports ready with complete KV credentials and healthy dependencies", async () => {
    vi.stubEnv("KV_REST_API_URL", "https://redis-fixture.example/");
    vi.stubEnv("KV_REST_API_TOKEN", "fixture-write-token");
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ result: "PONG" }), { status: 200 }));
    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ status: "ready", checks: { database: "ok", distributedRateLimit: "ok" } });
    expect(fetchMock.mock.calls[0][0]).toBe("https://redis-fixture.example");
    expect(fetchMock.mock.calls[0][1].headers.authorization).toBe("Bearer fixture-write-token");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual(["PING"]);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(JSON.stringify(body)).not.toContain("fixture-write-token");
    expect(JSON.stringify(body)).not.toContain("redis-fixture.example");
  });
  it("uses canonical credentials when both families are complete", async () => {
    vi.stubEnv("KV_REST_API_URL", "https://kv-fixture.example");
    vi.stubEnv("KV_REST_API_TOKEN", "kv-fixture-token");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://preferred-fixture.example");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "preferred-fixture-token");
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ result: "PONG" }), { status: 200 }));
    expect((await GET()).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("https://preferred-fixture.example");
  });
  it("fails closed for partial canonical credentials despite a complete KV pair", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://partial-fixture.example");
    vi.stubEnv("KV_REST_API_URL", "https://kv-fixture.example");
    vi.stubEnv("KV_REST_API_TOKEN", "kv-fixture-token");
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ checks: { distributedRateLimit: "not_configured" } });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("cannot become ready using only the read-only KV token", async () => {
    vi.stubEnv("KV_REST_API_URL", "https://kv-fixture.example");
    vi.stubEnv("KV_REST_API_READ_ONLY_TOKEN", "read-only-fixture");
    expect((await GET()).status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each(["http://kv-fixture.example", "malformed", "https://user:password@kv-fixture.example"])("cannot probe invalid REST URL %s", async (url) => {
    vi.stubEnv("KV_REST_API_URL", url);
    vi.stubEnv("KV_REST_API_TOKEN", "kv-fixture-token");
    expect((await GET()).status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each(["http_error", "wrong_result", "invalid_json", "network_failure"])("reports Redis unreachable on %s", async (failure) => {
    vi.stubEnv("KV_REST_API_URL", "https://kv-fixture.example");
    vi.stubEnv("KV_REST_API_TOKEN", "kv-fixture-token");
    if (failure === "network_failure") fetchMock.mockRejectedValue(new Error("fixture network failure"));
    else if (failure === "invalid_json") fetchMock.mockResolvedValue(new Response("not-json", { status: 200 }));
    else fetchMock.mockResolvedValue(new Response(JSON.stringify({ result: failure === "wrong_result" ? "WRONG" : "PONG" }), { status: failure === "http_error" ? 401 : 200 }));
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ status: "not_ready", checks: { distributedRateLimit: "unreachable" } });
  });
  it("still requires a healthy database when Redis is healthy", async () => {
    vi.stubEnv("KV_REST_API_URL", "https://kv-fixture.example");
    vi.stubEnv("KV_REST_API_TOKEN", "kv-fixture-token");
    createPublicClient.mockReturnValue(null);
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ result: "PONG" }), { status: 200 }));
    expect((await GET()).status).toBe(503);
  });
  it("keeps Redis optional only in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ checks: { distributedRateLimit: "optional_in_development" } });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
