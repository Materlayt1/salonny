import process from "node:process";

for (const file of [".env.production.local", ".env.local", ".env.production", ".env"]) {
  try {
    process.loadEnvFile(file);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

const failures = [];
const warnings = [];
const checks = {};
const value = (name) => process.env[name]?.trim() ?? "";

function requireValue(name, minimumLength = 1) {
  const configured = value(name);
  if (configured.length < minimumLength) failures.push(`${name} eksik veya çok kısa.`);
  checks[name] = configured ? "configured" : "missing";
  return configured;
}

function requireHttpsUrl(name) {
  const configured = requireValue(name);
  if (!configured) return "";
  try {
    const parsed = new URL(configured);
    if (parsed.protocol !== "https:") failures.push(`${name} HTTPS olmalı.`);
    return parsed.toString().replace(/\/$/, "");
  } catch {
    failures.push(`${name} geçerli bir URL değil.`);
    return "";
  }
}

const appUrl = requireHttpsUrl("NEXT_PUBLIC_APP_URL");
const supabaseUrl = requireHttpsUrl("NEXT_PUBLIC_SUPABASE_URL");
const supabaseAnonKey = requireValue("NEXT_PUBLIC_SUPABASE_ANON_KEY", 32);
requireValue("SUPABASE_SERVICE_ROLE_KEY", 32);
const redisUrl = requireHttpsUrl("UPSTASH_REDIS_REST_URL");
const redisToken = requireValue("UPSTASH_REDIS_REST_TOKEN", 20);
requireValue("CRON_SECRET", 32);
requireHttpsUrl("LOG_DRAIN_URL");
requireValue("LOG_DRAIN_TOKEN", 20);

if (value("NEXT_PUBLIC_SUPABASE_OFFLINE") === "true") {
  failures.push("NEXT_PUBLIC_SUPABASE_OFFLINE production'da true olamaz.");
}
if (!value("RATE_LIMIT_NAMESPACE")) warnings.push("RATE_LIMIT_NAMESPACE tanımlı değil; varsayılan namespace kullanılacak.");
if (!value("NEXT_DEPLOYMENT_ID")) warnings.push("NEXT_DEPLOYMENT_ID tanımlı değil; rolling deploy koruması hosting sağlayıcısına bırakılacak.");
if (!value("NEXT_SERVER_ACTIONS_ENCRYPTION_KEY")) warnings.push("NEXT_SERVER_ACTIONS_ENCRYPTION_KEY tanımlı değil; ayrı ayrı build edilen çoklu instance kullanma.");

async function probe(name, action) {
  try {
    await action();
    checks[name] = "ok";
  } catch (error) {
    checks[name] = "failed";
    failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (supabaseUrl && supabaseAnonKey) {
  await probe("supabase", async () => {
    const response = await fetch(`${supabaseUrl}/rest/v1/business_categories?select=id&limit=1`, {
      headers: { apikey: supabaseAnonKey, authorization: `Bearer ${supabaseAnonKey}` },
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  });
}

if (redisUrl && redisToken) {
  await probe("distributedRateLimit", async () => {
    const response = await fetch(redisUrl, {
      method: "POST",
      headers: { authorization: `Bearer ${redisToken}`, "content-type": "application/json" },
      body: JSON.stringify(["PING"]),
      signal: AbortSignal.timeout(3_000),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.result !== "PONG") throw new Error(`HTTP ${response.status}`);
  });
}

const deployedUrl = value("READINESS_URL") || appUrl;
if (value("READINESS_URL") && deployedUrl) {
  await probe("applicationReadiness", async () => {
    const response = await fetch(`${deployedUrl.replace(/\/$/, "")}/api/health/ready`, {
      signal: AbortSignal.timeout(8_000),
      headers: { "User-Agent": "Salonny-Production-Readiness/1.0" },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.status !== "ready") throw new Error(`HTTP ${response.status}`);
  });
}

console.log(JSON.stringify({
  status: failures.length ? "not_ready" : "ready",
  checks,
  failures,
  warnings,
}, null, 2));

if (failures.length) process.exitCode = 1;
