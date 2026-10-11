import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const scriptUrl = new URL("../scripts/production-readiness.mjs", import.meta.url).href;
const upstashUrl = "https://upstash.fixture.invalid";
const kvUrl = "https://kv.fixture.invalid";
const upstashToken = "fixture-upstash-write-token";
const kvToken = "fixture-kv-write-token-only";

type ScriptReport = {
  status: "ready" | "not_ready";
  checks: Record<string, string>;
  failures: string[];
  warnings: string[];
};

type ScriptOutput = {
  report: ScriptReport;
  requests: { url: string; body: unknown; authorization: string | null }[];
  interceptedEnvFiles: string[];
  unexpectedRequests: string[];
};

/**
 * Run the real command in a separate process, never inheriting developer/CI
 * credentials. Environment-file loading and every fetch are intercepted before
 * the command is imported; these are command-contract tests, not live probes.
 */
function runReadiness(overrides: Record<string, string> = {}) {
  const environment: NodeJS.ProcessEnv = {
    NODE_ENV: "production",
    NEXT_PUBLIC_APP_URL: "https://app.fixture.invalid",
    NEXT_PUBLIC_SUPABASE_URL: "https://project.fixture.invalid",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "fixture-public-anon-key-with-minimum-length",
    SUPABASE_SERVICE_ROLE_KEY: "fixture-service-role-key-with-minimum-length",
    CRON_SECRET: "fixture-cron-secret-with-minimum-length",
    LOG_DRAIN_URL: "https://logs.fixture.invalid",
    LOG_DRAIN_TOKEN: "fixture-log-drain-token",
    RATE_LIMIT_NAMESPACE: "fixture-namespace",
    NEXT_DEPLOYMENT_ID: "fixture-deployment",
    NEXT_SERVER_ACTIONS_ENCRYPTION_KEY: "fixture-encryption-key",
    ...overrides,
  };
  const bootstrap = `
    import process from "node:process";
    const outputs = [];
    const requests = [];
    const interceptedEnvFiles = [];
    const unexpectedRequests = [];
    const originalLog = console.log.bind(console);
    process.loadEnvFile = (file) => { interceptedEnvFiles.push(file); };
    console.log = (value) => { outputs.push(value); };
    const supabaseUrl = "https://project.fixture.invalid/rest/v1/business_categories?select=id&limit=1";
    const redisUrls = new Set([
      ${JSON.stringify(upstashUrl)},
      ${JSON.stringify(kvUrl)},
    ]);
    globalThis.fetch = async (input, init = {}) => {
      const url = String(input);
      const headers = new Headers(init.headers);
      requests.push({ url, body: init.body ? JSON.parse(init.body) : null, authorization: headers.get("authorization") });
      if (url === supabaseUrl) return new Response("[]", { status: 200 });
      if (redisUrls.has(url)) return new Response(JSON.stringify({ result: "PONG" }), { status: 200 });
      unexpectedRequests.push(url);
      throw new Error("Unexpected fixture request");
    };
    await import(${JSON.stringify(scriptUrl)});
    if (outputs.length !== 1) throw new Error("Expected one readiness report");
    originalLog(JSON.stringify({ report: JSON.parse(outputs[0]), requests, interceptedEnvFiles, unexpectedRequests }));
  `;
  const result = spawnSync(process.execPath, ["--input-type=module", "--eval", bootstrap], {
    env: environment,
    encoding: "utf8",
    windowsHide: true,
    timeout: 10_000,
    maxBuffer: 64 * 1_024,
  });
  expect(result.error).toBeUndefined();
  expect(result.signal).toBeNull();
  expect(result.stderr).toBe("");
  const output = JSON.parse(result.stdout) as ScriptOutput;
  expect(output.unexpectedRequests).toEqual([]);
  expect(output.interceptedEnvFiles).toEqual([".env.production.local", ".env.local", ".env.production", ".env"]);
  return { ...output, exitCode: result.status };
}

function redisRequests(output: ScriptOutput) {
  return output.requests.filter((request) => Array.isArray(request.body) && request.body[0] === "PING");
}

describe("production readiness command with isolated fixture configuration", () => {
  it("accepts a complete writable KV pair without demanding Upstash aliases", () => {
    const output = runReadiness({ KV_REST_API_URL: `${kvUrl}/`, KV_REST_API_TOKEN: kvToken });
    expect(output.exitCode).toBe(0);
    expect(output.report).toMatchObject({ status: "ready", failures: [], checks: {
      redisRestConfiguration: "kv", KV_REST_API_URL: "configured", KV_REST_API_TOKEN: "configured", distributedRateLimit: "ok",
    } });
    expect(output.report.checks).not.toHaveProperty("UPSTASH_REDIS_REST_URL");
    expect(redisRequests(output)).toEqual([{ url: kvUrl, body: ["PING"], authorization: `Bearer ${kvToken}` }]);
  });

  it("prefers a complete canonical Upstash pair when both families exist", () => {
    const output = runReadiness({
      UPSTASH_REDIS_REST_URL: upstashUrl, UPSTASH_REDIS_REST_TOKEN: upstashToken,
      KV_REST_API_URL: kvUrl, KV_REST_API_TOKEN: kvToken,
    });
    expect(output.exitCode).toBe(0);
    expect(output.report).toMatchObject({ status: "ready", failures: [], checks: {
      redisRestConfiguration: "upstash", UPSTASH_REDIS_REST_URL: "configured", UPSTASH_REDIS_REST_TOKEN: "configured",
    } });
    expect(output.report.checks).not.toHaveProperty("KV_REST_API_URL");
    expect(redisRequests(output)).toEqual([{ url: upstashUrl, body: ["PING"], authorization: `Bearer ${upstashToken}` }]);
  });

  it.each([
    { UPSTASH_REDIS_REST_URL: upstashUrl, UPSTASH_REDIS_REST_TOKEN: "" },
    { UPSTASH_REDIS_REST_URL: "", UPSTASH_REDIS_REST_TOKEN: upstashToken },
  ])("never falls back to KV when canonical configuration is incomplete: %j", (partial) => {
    const output = runReadiness({ ...partial, KV_REST_API_URL: kvUrl, KV_REST_API_TOKEN: kvToken });
    expect(output.exitCode).toBe(1);
    expect(output.report).toMatchObject({ status: "not_ready", checks: { redisRestConfiguration: "missing_or_incomplete" } });
    expect(output.report.failures).toEqual([expect.stringContaining("eksik/geçersiz Upstash çifti KV ile tamamlanamaz")]);
    expect(redisRequests(output)).toEqual([]);
  });

  it("does not treat a read-only KV token as writable configuration", () => {
    const output = runReadiness({ KV_REST_API_URL: kvUrl, KV_REST_API_READ_ONLY_TOKEN: "fixture-read-only-token" });
    expect(output.exitCode).toBe(1);
    expect(output.report).toMatchObject({ status: "not_ready", checks: { redisRestConfiguration: "missing_or_incomplete" } });
    expect(output.report.failures).toHaveLength(1);
    expect(redisRequests(output)).toEqual([]);
  });

  it("fails when both credential families are absent", () => {
    const output = runReadiness();
    expect(output.exitCode).toBe(1);
    expect(output.report).toMatchObject({ status: "not_ready", checks: { redisRestConfiguration: "missing_or_incomplete" } });
    expect(output.report.failures).toHaveLength(1);
    expect(redisRequests(output)).toEqual([]);
  });

  it.each([
    "http://kv.fixture.invalid",
    "https://[invalid",
    "https://fixture-user:fixture-password@kv.fixture.invalid",
    "https://kv.fixture.invalid?fixture=query",
    "https://kv.fixture.invalid#fixture-fragment",
  ])("rejects an unsafe or malformed KV URL without probing it: %s", (url) => {
    const output = runReadiness({ KV_REST_API_URL: url, KV_REST_API_TOKEN: kvToken });
    expect(output.exitCode).toBe(1);
    expect(output.report).toMatchObject({ status: "not_ready", checks: { redisRestConfiguration: "missing_or_incomplete" } });
    expect(output.report.failures).toEqual([expect.stringContaining("geçerli HTTPS URL")]);
    expect(output.report.checks).not.toHaveProperty("distributedRateLimit");
    expect(redisRequests(output)).toEqual([]);
  });

  it("does not fall back to healthy KV configuration when the canonical URL is invalid", () => {
    const output = runReadiness({
      UPSTASH_REDIS_REST_URL: "http://upstash.fixture.invalid", UPSTASH_REDIS_REST_TOKEN: upstashToken,
      KV_REST_API_URL: kvUrl, KV_REST_API_TOKEN: kvToken,
    });
    expect(output.exitCode).toBe(1);
    expect(output.report).toMatchObject({ status: "not_ready", checks: { redisRestConfiguration: "missing_or_incomplete" } });
    expect(output.report.failures).toEqual([expect.stringContaining("eksik/geçersiz Upstash çifti KV ile tamamlanamaz")]);
    expect(redisRequests(output)).toEqual([]);
  });

  it("rejects an HTTP Supabase URL without sending credentials to it", () => {
    const output = runReadiness({
      NEXT_PUBLIC_SUPABASE_URL: "http://fixture-supabase.example",
      KV_REST_API_URL: kvUrl, KV_REST_API_TOKEN: kvToken,
    });
    expect(output.exitCode).toBe(1);
    expect(output.report).toMatchObject({ status: "not_ready", checks: { redisRestConfiguration: "kv", distributedRateLimit: "ok" } });
    expect(output.report.failures).toEqual(["NEXT_PUBLIC_SUPABASE_URL HTTPS olmalı."]);
    expect(output.report.checks).not.toHaveProperty("supabase");
    expect(output.requests).toEqual([{ url: kvUrl, body: ["PING"], authorization: `Bearer ${kvToken}` }]);
  });
});
