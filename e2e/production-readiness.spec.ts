import { expect, test } from "@playwright/test";

test("health probes expose liveness and dependency readiness without caching", async ({ request }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "HTTP checks only need one browser project");

  const live = await request.get("/api/health/live");
  expect(live.status()).toBe(200);
  expect(live.headers()["cache-control"]).toContain("no-store");
  await expect(live.json()).resolves.toMatchObject({ status: "ok", service: "salonny-web" });

  const ready = await request.get("/api/health/ready");
  expect([200, 503]).toContain(ready.status());
  expect(ready.headers()["cache-control"]).toContain("no-store");
  await expect(ready.json()).resolves.toMatchObject({ checks: { database: expect.any(String), distributedRateLimit: expect.any(String) } });
});

test("public responses include production security and cache headers", async ({ request }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "HTTP checks only need one browser project");

  const page = await request.get("/");
  expect(page.headers()["content-security-policy"]).toContain("object-src 'none'");
  expect(page.headers()["x-frame-options"]).toBe("DENY");
  expect(page.headers()["permissions-policy"]).toContain("payment=()");

  const businesses = await request.get("/api/businesses");
  expect(businesses.headers()["cache-control"]).toContain("s-maxage=60");
});
