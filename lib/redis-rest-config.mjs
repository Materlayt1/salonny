/**
 * Resolve one complete writable Redis REST credential pair. Explicit Upstash
 * configuration takes precedence; a partial pair must never be completed with
 * another provider family's credentials or silently fall back to that family.
 */
function validatedRedisRestUrl(value) {
  try {
    // These server credentials must never be sent over plaintext or embedded
    // URL credentials. Native REST endpoints do not need query/fragment data.
    if (!/^https:\/\//i.test(value) || /\s/u.test(value) || value.includes("?") || value.includes("#")) return null;
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" || !parsed.hostname || parsed.username || parsed.password) return null;
    return parsed.href.replace(/\/$/, "");
  } catch {
    return null;
  }
}

export function resolveRedisRestConfig(environment = process.env) {
  const upstashUrl = environment.UPSTASH_REDIS_REST_URL?.trim() ?? "";
  const upstashToken = environment.UPSTASH_REDIS_REST_TOKEN?.trim() ?? "";
  if (upstashUrl || upstashToken) {
    if (!upstashUrl || !upstashToken) return null;
    const url = validatedRedisRestUrl(upstashUrl);
    if (!url) return null;
    return {
      url,
      token: upstashToken,
      urlName: "UPSTASH_REDIS_REST_URL",
      tokenName: "UPSTASH_REDIS_REST_TOKEN",
      family: "upstash",
    };
  }

  const kvUrl = environment.KV_REST_API_URL?.trim() ?? "";
  const kvToken = environment.KV_REST_API_TOKEN?.trim() ?? "";
  // KV_REST_API_READ_ONLY_TOKEN cannot run the atomic INCR/PEXPIRE limiter.
  if (!kvUrl || !kvToken) return null;
  const url = validatedRedisRestUrl(kvUrl);
  if (!url) return null;
  return {
    url,
    token: kvToken,
    urlName: "KV_REST_API_URL",
    tokenName: "KV_REST_API_TOKEN",
    family: "kv",
  };
}
