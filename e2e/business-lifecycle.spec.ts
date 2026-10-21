import { expect, test } from "@playwright/test";

// Invalid syntax is rejected before DB access, so this runs in offline CI too.
// Actual valid-but-withdrawn records and outage separation are covered by API/SQL tests.
for (const path of ["/business/unavailable-qa!", "/izmir/bornova/kuafor/unavailable-qa!"]) {
  test(`unavailable business has a responsive discover exit: ${path}`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: "İşletme şu anda yayında değil", exact: true })).toBeVisible();
    const exit = page.getByRole("link", { name: "İşletmeleri keşfet", exact: true });
    await expect(exit).toHaveAttribute("href", "/kesfet");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `artifacts/web-business-unavailable-${test.info().project.name}-${path.startsWith("/business/") ? "short" : "seo"}.png` });
    await exit.click();
    await expect(page).toHaveURL(/\/kesfet$/);
  });
}

test("account deletion stays behind sign-in and rejects foreign-origin writes", async ({ page, request }) => {
  // Configured proxy uses HTTP redirect; unconfigured clean CI may stream a
  // redirect meta tag with HTTP 200. Assert the actual browser destination.
  await page.goto("/delete-account");
  await expect(page).toHaveURL(/\/auth\/login\?next=(?:%2F|\/)delete-account/);
  await expect(page.getByRole("heading", { name: "Tekrar hoş geldin", exact: true })).toBeVisible();
  await expect(page.locator('input[name="confirmed"]')).toHaveCount(0);
  // A production server without Redis correctly fails closed before auth.
  // Exercise the earlier origin gate without weakening that critical limiter.
  const api = await request.delete("/api/customer-profile", { headers: { origin: "https://invalid-origin.example" }, data: { confirmed: true } });
  expect(api.status()).toBe(403);
  expect(await api.json()).toEqual({ error: "Geçersiz istek kaynağı." });
  expect(api.headers()["cache-control"]).toBe("no-store");
});
