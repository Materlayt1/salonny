import { expect, test } from "@playwright/test";

test("home notification badges share one read and one focus invalidation", async ({ page }) => {
  let reads = 0;
  await page.route("**/api/notifications?summary=1", (route) => route.fulfill({ json: { unreadCount: 3 + ++reads, checkedAt: new Date().toISOString() } }));
  await page.route("**/api/businesses?**", (route) => route.fulfill({ json: { businesses: [], total: 0, hasMore: false } }));
  await page.goto("/");
  await expect(page.getByLabel("4 okunmamış bildirim", { exact: true })).toHaveCount(1);
  expect(reads).toBe(1);
  await page.evaluate(() => { window.dispatchEvent(new Event("focus")); window.dispatchEvent(new Event("focus")); document.dispatchEvent(new Event("visibilitychange")); });
  await expect(page.getByLabel("5 okunmamış bildirim", { exact: true })).toHaveCount(1);
  expect(reads).toBe(2);
});

test("notification history remains protected before any private list is rendered", async ({ page }) => {
  const response = await page.goto("/notifications");
  expect(response?.status()).toBe(200);
  if (new URL(page.url()).pathname === "/auth/login") {
    await expect(page).toHaveURL(/\/auth\/login\?next=%2Fnotifications/);
    await expect(page.getByRole("heading", { name: "Tekrar hoş geldin", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Bildirimler", exact: true })).toHaveCount(0);
  } else {
    // Clean CI intentionally has no Supabase credentials. The existing offline
    // SSR contract is an explicit outage, never an authenticated/empty list.
    await expect(page).toHaveURL(/\/notifications$/);
    await expect(page.getByRole("alert")).toHaveText(/Bildirimlere şu anda ulaşılamıyor\. Bu, boş bir liste değil\./);
    await expect(page.getByRole("button", { name: "Tümünü okundu işaretle", exact: true })).toBeDisabled();
    await expect(page.getByRole("heading", { name: "Bu bölümde bildirim yok", exact: true })).toHaveCount(0);
    await expect(page.locator("main a[href='/appointments']")).toHaveCount(0);
  }
  for (const query of ["?kind=review&unread=true", "?summary=1"]) {
    const result = await page.request.get("/api/notifications" + query);
    expect(result.status()).toBe(401);
    expect(result.headers()["cache-control"]).toBe("private, no-store");
    expect(await result.json()).not.toHaveProperty("notifications");
  }
});
