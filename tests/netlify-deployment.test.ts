import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { rateLimitKeyFromHeaders } from "@/lib/api-security";
import { hostedMobileRewrites } from "@/lib/hosted-mobile-routes";

afterEach(() => vi.unstubAllEnvs());

describe("Netlify full-stack deployment", () => {
  const config = readFileSync(new URL("../netlify.toml", import.meta.url), "utf8");
  const rules = config.split("[[redirects]]").slice(1).map((block) => ({
    from: block.match(/from = "([^"]+)"/)?.[1],
    to: block.match(/to = "([^"]+)"/)?.[1],
    status: block.match(/status = (\d+)/)?.[1],
  }));

  it("builds the native preview and the Next.js backend, without a static export", () => {
    expect(config).toContain('command = "pnpm mobile:export:hosted && pnpm build"');
    expect(config).toContain('publish = ".next"');
    expect(config).toContain('NODE_VERSION = "24"');
    expect(config).toContain('PNPM_VERSION = "11.25.0"');
    expect(config).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY\s*=|REDIS_REST_TOKEN\s*=|KV_REST_API_TOKEN\s*=/);
  });

  it("matches every native screen without intercepting API routes or module assets", () => {
    expect(rules).toHaveLength(hostedMobileRewrites.length);
    for (const expected of hostedMobileRewrites) {
      const normalized = expected.source.replace(":value([^/.]+)", ":value").replace(/:value$/, ":param");
      expect(rules.some((rule) => rule.from?.replace(/:[^/]+$/, ":param") === normalized && rule.to === expected.destination && rule.status === "200")).toBe(true);
    }
    expect(rules.every((rule) => rule.from?.startsWith("/mobile") && !rule.from.includes("*") && !rule.from.includes("_expo"))).toBe(true);
    expect(config).toContain('X-Robots-Tag = "noindex, nofollow"');
    expect(config).toContain('X-Content-Type-Options = "nosniff"');
  });

  it("uses Netlify's edge identity despite spoofed foreign-provider IP headers and user agents", () => {
    vi.stubEnv("HOSTING_PLATFORM", "netlify");
    const key = (spoofed: string) => rateLimitKeyFromHeaders(new Headers({
      "x-nf-client-connection-ip": "192.0.2.10", "x-vercel-forwarded-for": spoofed,
      "cf-connecting-ip": spoofed, "x-forwarded-for": spoofed, "user-agent": spoofed,
    }));
    expect(key("one")).toBe(key("two"));
    expect(key("one")).toBe(createHash("sha256").update("netlify:192.0.2.10").digest("base64url").slice(0, 32));
  });

  it("does not fall back to an attacker-controlled identity when Netlify's IP is missing", () => {
    vi.stubEnv("HOSTING_PLATFORM", "netlify");
    expect(rateLimitKeyFromHeaders(new Headers({ "x-forwarded-for": "one", "user-agent": "one" })))
      .toBe(rateLimitKeyFromHeaders(new Headers({ "x-forwarded-for": "two", "user-agent": "two" })));
  });

  it("keeps the existing hosting behavior outside Netlify", () => {
    vi.stubEnv("HOSTING_PLATFORM", "");
    const headers = new Headers({ "x-vercel-forwarded-for": "192.0.2.20", "user-agent": "fixture" });
    expect(rateLimitKeyFromHeaders(headers)).toBe(createHash("sha256").update("192.0.2.20|fixture").digest("base64url").slice(0, 32));
  });
});
