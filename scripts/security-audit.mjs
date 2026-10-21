import { spawnSync } from "node:child_process";
import { verifyDependencyMitigations } from "./dependency-regressions.mjs";

if (!process.env.npm_execpath) throw new Error("Run this check with pnpm test:security.");
const result = spawnSync(process.execPath, [process.env.npm_execpath, "audit", "--prod", "--json"], {
  encoding: "utf8", maxBuffer: 20 * 1024 * 1024,
});
if (result.error) throw result.error;
const report = JSON.parse(result.stdout);
if (!report.advisories || (result.status !== 0 && result.status !== 1)) throw new Error("Dependency audit did not return a valid report.");
const verified = verifyDependencyMitigations();
const mitigated = [];
const unresolved = [];
for (const advisory of Object.values(report.advisories)) {
  const mitigation = verified[advisory.github_advisory_id];
  const exactVersion = mitigation && advisory.module_name === mitigation.package
    && advisory.findings.every((finding) => finding.version === mitigation.version);
  if (exactVersion) mitigated.push({ id: advisory.github_advisory_id, package: advisory.module_name, patchRegression: "passed" });
  else unresolved.push({ id: advisory.github_advisory_id, package: advisory.module_name, severity: advisory.severity, url: advisory.url });
}
if (!Object.keys(report.advisories).length && result.status !== 0) throw new Error("Audit failed without advisory details.");
console.log(JSON.stringify({ status: unresolved.length ? "failed" : "passed", localPatches: mitigated, unresolved }, null, 2));
if (unresolved.length) process.exitCode = 1;
