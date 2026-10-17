import { expect, test } from "@playwright/test";

test("notification history remains protected before any private list is rendered", async ({ page }) => {
  const response = await page.goto("/notifications");
  expect(response?.status()).toBe(200);
  await expect(page).toHaveURL(/\/auth\/login\?next=%2Fnotifications/);
  await expect(page.getByRole("heading", { name: "Tekrar hoş geldin", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Bildirimler", exact: true })).toHaveCount(0);
  for (const query of ["?kind=review&unread=true", "?summary=1"]) {
    const result = await page.request.get("/api/notifications" + query);
    expect(result.status()).toBe(401);
    expect(result.headers()["cache-control"]).toBe("private, no-store");
    expect(await result.json()).not.toHaveProperty("notifications");
  }
});
