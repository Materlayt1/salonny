const target = (process.env.LOAD_TEST_URL ?? "http://localhost:3000").replace(/\/$/, "");
const total = Math.min(100_000, Math.max(1, Number(process.env.LOAD_TEST_REQUESTS ?? 200)));
const concurrency = Math.min(1_000, Math.max(1, Number(process.env.LOAD_TEST_CONCURRENCY ?? 20)));
const maxP95Ms = Math.max(1, Number(process.env.LOAD_TEST_MAX_P95_MS ?? 2_500));
const minRequestsPerSecond = Math.max(0, Number(process.env.LOAD_TEST_MIN_RPS ?? 20));
const paths = ["/", "/kesfet", "/api/businesses", "/api/categories", "/api/health/live"];
const timings = [];
const statuses = new Map();
let cursor = 0;
let failures = 0;

async function worker() {
  while (cursor < total) {
    const index = cursor++;
    const path = paths[index % paths.length];
    const startedAt = performance.now();
    try {
      const response = await fetch(`${target}${path}`, {
        headers: { "User-Agent": "Salonny-ReadOnly-Load-Smoke/1.0" },
        signal: AbortSignal.timeout(15_000),
      });
      await response.arrayBuffer();
      timings.push(performance.now() - startedAt);
      statuses.set(response.status, (statuses.get(response.status) ?? 0) + 1);
      if (!response.ok) failures += 1;
    } catch {
      timings.push(performance.now() - startedAt);
      failures += 1;
      statuses.set("network_error", (statuses.get("network_error") ?? 0) + 1);
    }
  }
}

const startedAt = performance.now();
await Promise.all(Array.from({ length: concurrency }, () => worker()));
const durationMs = performance.now() - startedAt;
timings.sort((a, b) => a - b);
const percentile = (value) => Math.round(timings[Math.min(timings.length - 1, Math.ceil(timings.length * value) - 1)] ?? 0);
const p95 = percentile(0.95);
const requestsPerSecond = Number((total / (durationMs / 1_000)).toFixed(2));

console.log(JSON.stringify({
  target,
  requests: total,
  concurrency,
  durationMs: Math.round(durationMs),
  requestsPerSecond,
  latencyMs: { p50: percentile(0.5), p95, p99: percentile(0.99), max: Math.round(timings.at(-1) ?? 0) },
  statuses: Object.fromEntries(statuses),
  failures,
  thresholds: { maxP95Ms, minRequestsPerSecond },
}, null, 2));

if (failures > 0 || p95 > maxP95Ms || requestsPerSecond < minRequestsPerSecond) process.exitCode = 1;
