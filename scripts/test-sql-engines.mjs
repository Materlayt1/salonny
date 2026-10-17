// Reproducible synthetic SQL gates. No environment secrets or remote database.
import { spawnSync } from "node:child_process";
const engines = ["staff-schedule-engine", "coupon-engine", "report-engine", "package-ledger-engine", "campaign-editor", "customer-care-engine", "business-setup-engine", "booking-policy-engine"];
const summaries = [];
function countPasses(value) {
  if (Array.isArray(value)) return value.reduce((total, child) => total + countPasses(child), 0);
  if (!value || typeof value !== "object") return 0;
  const nested = Object.values(value).filter((child) => child && typeof child === "object");
  return nested.length ? nested.reduce((total, child) => total + countPasses(child), 0) : value.result === "PASS" ? 1 : 0;
}
for (const engine of engines) {
  const result = spawnSync(process.execPath, [`scripts/test-${engine}.mjs`], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024, env: { ...process.env, SALONNY_PGLITE_MODULE_PATH: "" } });
  if (result.error) throw result.error;
  if (result.status !== 0) { process.stdout.write(result.stdout ?? ""); process.stderr.write(result.stderr ?? ""); process.exit(result.status ?? 1); }
  const checks = countPasses(JSON.parse(result.stdout));
  if (!checks) throw new Error(`SQL engine ${engine} returned no passing checks`);
  summaries.push({ engine, checks, status: "PASS" });
}
console.log(JSON.stringify({ status: "PASS", total: summaries.reduce((total, item) => total + item.checks, 0), engines: summaries }, null, 2));
