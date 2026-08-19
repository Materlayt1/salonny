type Entry = { count: number; resetAt: number };
const buckets = new Map<string, Entry>();

type RateLimitResult = { allowed: boolean; remaining: number; resetAt: number };

async function checkDistributedRateLimit(key: string, limit: number, windowMs: number): Promise<RateLimitResult | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL?.replace(/\/$/, "");
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const script = "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('PEXPIRE',KEYS[1],ARGV[1]); end; local ttl=redis.call('PTTL',KEYS[1]); return {n,ttl}";
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(["EVAL", script, "1", `${process.env.RATE_LIMIT_NAMESPACE ?? "service-marketplace"}:ratelimit:${key}`, String(windowMs)]),
      cache: "no-store",
      signal: AbortSignal.timeout(1_500),
    });
    if (!response.ok) return null;
    const payload = await response.json() as { result?: [number, number] };
    if (!Array.isArray(payload.result)) return null;
    const [count, ttl] = payload.result;
    return { allowed: count <= limit, remaining: Math.max(0, limit - count), resetAt: Date.now() + Math.max(0, ttl) };
  } catch {
    return null;
  }
}

function checkMemoryRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, resetAt: now + windowMs };
  }
  current.count += 1;
  if (buckets.size > 10_000) for (const [bucketKey, value] of buckets) if (value.resetAt <= now) buckets.delete(bucketKey);
  return { allowed: current.count <= limit, remaining: Math.max(0, limit - current.count), resetAt: current.resetAt };
}

export async function checkRateLimit(key: string, limit = 20, windowMs = 60_000) {
  return await checkDistributedRateLimit(key, limit, windowMs) ?? checkMemoryRateLimit(key, limit, windowMs);
}
