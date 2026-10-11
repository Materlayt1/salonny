import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkRateLimit, RateLimitUnavailableError } from "@/lib/rate-limit";

const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubEnv("NODE_ENV", "test");
  for (const name of ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_URL", "KV_REST_API_TOKEN", "KV_REST_API_READ_ONLY_TOKEN"]) vi.stubEnv(name, "");
  vi.stubEnv("RATE_LIMIT_NAMESPACE", "fixture");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

function configureKv() {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("KV_REST_API_URL", "https://fixture-redis.example/");
  vi.stubEnv("KV_REST_API_TOKEN", "fixture-writable-token");
}

describe("rate limit", () => {
  it("uses the bounded local limiter outside production when Redis is unavailable", async () => {
    const key = `test-${crypto.randomUUID()}`;

    const first = await checkRateLimit(key, 1, 60_000);
    const second = await checkRateLimit(key, 1, 60_000);

    expect(first).toMatchObject({ allowed: true, remaining: 0 });
    expect(second).toMatchObject({ allowed: false, remaining: 0 });
    expect(second.resetAt).toBe(first.resetAt);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses the writable KV pair and preserves the atomic window and TTL", async () => {
    configureKv();
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ result: [2, 59_999] }), { status: 200 }));
    await expect(checkRateLimit("same-key", 20, 60_000, { failClosed: true })).resolves.toEqual({
      allowed: true, remaining: 18, resetAt: 1_700_000_059_999,
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://fixture-redis.example");
    expect(init.headers.authorization).toBe("Bearer fixture-writable-token");
    const command = JSON.parse(init.body);
    expect(command).toEqual(["EVAL", expect.any(String), "1", "fixture:ratelimit:same-key", "60000"]);
    expect(command[1]).toContain("redis.call('INCR',KEYS[1])");
    expect(command[1]).toContain("redis.call('PEXPIRE',KEYS[1],ARGV[1])");
    expect(command[1]).toContain("redis.call('PTTL',KEYS[1])");
    expect(init.cache).toBe("no-store");
  });

  it("denies an over-limit KV response without falling back to memory", async () => {
    configureKv();
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ result: [21, 10_000] }), { status: 200 }));
    await expect(checkRateLimit(crypto.randomUUID(), 20, 60_000, { failClosed: true })).resolves.toMatchObject({ allowed: false, remaining: 0 });
  });

  it.each(["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"])("fails closed for a partial %s even with a complete KV pair", async (name) => {
    configureKv();
    vi.stubEnv(name, "fixture-partial-upstash");
    await expect(checkRateLimit(crypto.randomUUID(), 20, 60_000, { failClosed: true })).rejects.toBeInstanceOf(RateLimitUnavailableError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not mask an unavailable preferred Upstash pair with KV", async () => {
    configureKv();
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://preferred.example");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "fixture-preferred-token");
    fetchMock.mockResolvedValue(new Response("{}", { status: 401 }));
    await expect(checkRateLimit(crypto.randomUUID(), 20, 60_000, { failClosed: true })).rejects.toBeInstanceOf(RateLimitUnavailableError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("https://preferred.example");
  });

  it("never substitutes the KV read-only token", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("KV_REST_API_URL", "https://fixture-redis.example");
    vi.stubEnv("KV_REST_API_READ_ONLY_TOKEN", "fixture-read-only-token");
    await expect(checkRateLimit(crypto.randomUUID(), 20, 60_000, { failClosed: true })).rejects.toBeInstanceOf(RateLimitUnavailableError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("remains fail-closed on Redis connection failure", async () => {
    configureKv();
    fetchMock.mockRejectedValue(new Error("fixture network failure"));
    await expect(checkRateLimit(crypto.randomUUID(), 20, 60_000, { failClosed: true })).rejects.toBeInstanceOf(RateLimitUnavailableError);
  });
  it.each(["http://fixture-redis.example", "malformed", "https://user:password@fixture-redis.example", "https://fixture-redis.example?fixture=1", "https://fixture-redis.example#fixture"])("never sends a server token to an invalid REST URL: %s", async (url) => {
    configureKv();
    vi.stubEnv("KV_REST_API_URL", url);
    await expect(checkRateLimit(crypto.randomUUID(), 20, 60_000, { failClosed: true })).rejects.toBeInstanceOf(RateLimitUnavailableError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("never falls back to KV after an invalid canonical URL", async () => {
    configureKv();
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "http://preferred.example");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "fixture-preferred-token");
    await expect(checkRateLimit(crypto.randomUUID(), 20, 60_000, { failClosed: true })).rejects.toBeInstanceOf(RateLimitUnavailableError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  const malformed = [
    null, [], {}, { error: "ERR permission denied" }, { result: [1, 100], error: "ERR" },
    { result: null }, { result: "1,100" }, { result: [] }, { result: [1] }, { result: [1, 100, 2] },
    { result: ["1", 100] }, { result: [1, "100"] }, { result: [0, 100] }, { result: [-1, 100] },
    { result: [1.5, 100] }, { result: [Number.MAX_SAFE_INTEGER + 1, 100] },
    { result: [1, 0] }, { result: [1, -1] }, { result: [1, 100.5] },
    { result: [1, Number.MAX_SAFE_INTEGER + 1] }, { result: [1, Number.MAX_SAFE_INTEGER] },
    { result: [null, 100] }, { result: [1, null] },
  ];
  it.each(malformed.map((payload, index) => ({ payload, index })))("fails closed on malformed EVAL result $index", async ({ payload }) => {
    configureKv();
    fetchMock.mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 }));
    await expect(checkRateLimit(crypto.randomUUID(), 20, 60_000, { failClosed: true })).rejects.toBeInstanceOf(RateLimitUnavailableError);
  });

  it("fails closed when Redis returns invalid JSON", async () => {
    configureKv();
    fetchMock.mockResolvedValue(new Response("not-json", { status: 200 }));
    await expect(checkRateLimit(crypto.randomUUID(), 20, 60_000, { failClosed: true })).rejects.toBeInstanceOf(RateLimitUnavailableError);
  });
});
