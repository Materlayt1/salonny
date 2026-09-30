import { describe, expect, it, vi } from "vitest";
import { checkRateLimit } from "@/lib/rate-limit";

describe("rate limit", () => {
  it("uses the bounded local limiter outside production when Redis is unavailable", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    const key = `test-${crypto.randomUUID()}`;

    const first = await checkRateLimit(key, 1, 60_000);
    const second = await checkRateLimit(key, 1, 60_000);

    expect(first).toMatchObject({ allowed: true, remaining: 0 });
    expect(second).toMatchObject({ allowed: false, remaining: 0 });
    expect(second.resetAt).toBe(first.resetAt);
    vi.unstubAllEnvs();
  });
});
