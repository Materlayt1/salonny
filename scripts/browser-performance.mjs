import { chromium, devices } from "@playwright/test";

const baseUrl = (process.env.PERF_TEST_URL ?? "http://localhost:3000").replace(/\/$/, "");
const maxDomContentLoadedMs = Number(process.env.PERF_TEST_MAX_DCL_MS ?? 5_000);
const routes = ["/", "/kesfet"];
const profiles = [
  { name: "desktop", context: { viewport: { width: 1440, height: 900 } } },
  { name: "mobile", context: devices["iPhone 13"] },
];
const results = [];
let failed = false;
const browser = await chromium.launch({ headless: true });

try {
  for (const profile of profiles) {
    const context = await browser.newContext(profile.context);
    for (const route of routes) {
      const page = await context.newPage();
      const pageErrors = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));
      await page.addInitScript(() => {
        window.__salonnyVitals = { lcp: 0, cls: 0, longTasks: 0 };
        new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const last = entries.at(-1);
          if (last) window.__salonnyVitals.lcp = last.startTime;
        }).observe({ type: "largest-contentful-paint", buffered: true });
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (!entry.hadRecentInput) window.__salonnyVitals.cls += entry.value;
          }
        }).observe({ type: "layout-shift", buffered: true });
        new PerformanceObserver((list) => {
          window.__salonnyVitals.longTasks += list.getEntries().length;
        }).observe({ type: "longtask", buffered: true });
      });
      const response = await page.goto(`${baseUrl}${route}`, { waitUntil: "load", timeout: 30_000 });
      await page.waitForTimeout(750);
      const metrics = await page.evaluate(() => {
        const navigation = performance.getEntriesByType("navigation")[0];
        const resources = performance.getEntriesByType("resource");
        return {
          ttfbMs: Math.round(navigation.responseStart),
          domContentLoadedMs: Math.round(navigation.domContentLoadedEventEnd),
          loadMs: Math.round(navigation.loadEventEnd),
          transferKb: Math.round(resources.reduce((sum, item) => sum + (item.transferSize || 0), 0) / 1024),
          resourceCount: resources.length,
          ...window.__salonnyVitals,
        };
      });
      const status = response?.status() ?? 0;
      const row = { profile: profile.name, route, status, pageErrors, ...metrics };
      results.push(row);
      if (status < 200 || status >= 400 || pageErrors.length || metrics.domContentLoadedMs > maxDomContentLoadedMs) failed = true;
      await page.close();
    }
    await context.close();
  }
} finally {
  await browser.close();
}

console.log(JSON.stringify({ baseUrl, maxDomContentLoadedMs, results }, null, 2));
if (failed) process.exitCode = 1;
