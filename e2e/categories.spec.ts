import { expect, test } from "@playwright/test";

test("header or home categories opens a dedicated picker, then the selected category discovery", async ({ page }) => {
  await page.goto("/");
  if (test.info().project.name === "mobile") {
    await page.locator("section").filter({ has: page.getByRole("heading", { name: "Kategoriler", exact: true }) }).getByRole("link", { name: "Tümünü gör", exact: true }).click();
  } else await page.getByRole("link", { name: "Kategoriler", exact: true }).filter({ visible: true }).click();
  await expect(page).toHaveURL(/\/kategoriler$/); await expect(page.getByRole("heading", { name: "Kategoriler", exact: true })).toBeVisible();
  if (test.info().project.name === "mobile") {
    await page.getByRole("button", { name: "Menü", exact: true }).click();
    await page.getByRole("link", { name: "Kategoriler", exact: true }).filter({ visible: true }).click();
    await expect(page.getByRole("link", { name: "Kategoriler", exact: true }).filter({ visible: true })).toHaveCount(0);
  }
  const category = page.getByRole("main").getByRole("link", { name: "Kuaför", exact: true });
  await expect(category).toHaveAttribute("href", "/kesfet?category=kuafor");
  const filteredRequest = page.waitForRequest((request) => { const url = new URL(request.url()); return url.pathname === "/api/businesses" && url.searchParams.get("category") === "kuafor"; });
  await category.click(); await filteredRequest;
  await expect(page).toHaveURL(/\/kesfet\?category=kuafor$/);
  if (test.info().project.name === "mobile") await expect(page.getByTestId("mobile-sheet-handle")).toBeVisible();
  else await expect(page.getByRole("heading", { name: "Yayınlanmış işletmeler" })).toBeVisible();
  await page.reload(); await expect(page).toHaveURL(/category=kuafor/);
});
