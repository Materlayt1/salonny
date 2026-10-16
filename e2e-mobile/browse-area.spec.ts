import { expect, test } from "@playwright/test";
import { business, mockApi } from "./fixtures";
const izmir = { ...business, name: "İzmir kontrol salonu" };
const istanbul = { ...business, id: "10000000-0000-4000-8000-000000000099", slug: "istanbul-kontrol", name: "İstanbul kontrol salonu", city: "İstanbul", district: "Kadıköy", lat: 41.01, lng: 28.98 };
async function setup(page: import("@playwright/test").Page) {
  await mockApi(page);
  await page.route("http://localhost:3001/api/businesses?**", async (route) => {
    const params = new URL(route.request().url()).searchParams;
    const city = params.get("city");
    const items = city === "Ankara" ? [] : city === "İstanbul" ? [istanbul] : city || params.has("radius") ? [izmir] : [izmir, istanbul];
    await route.fulfill({ headers: { "Access-Control-Allow-Origin": "http://localhost:8082" }, json: { businesses: items, total: items.length, hasMore: false } });
  });
}
async function choose(page: import("@playwright/test").Page, city: string) {
  await page.getByRole("button", { name: /^Şehir seçimi:/ }).click();
  const sheet = page.getByTestId("browse-city-sheet");
  await sheet.getByLabel("Şehir ara").fill(city);
  await sheet.getByRole("button", { name: city, exact: true }).click();
}
test("city picker filters all home rails, persists and follows discovery", async ({ page }) => {
  await setup(page); await page.goto("/"); await choose(page, "İzmir");
  await expect(page.getByRole("button", { name: "İzmir kontrol salonu işletmesini aç", exact: true }).first()).toBeAttached();
  await expect(page.getByRole("button", { name: "İstanbul kontrol salonu işletmesini aç", exact: true })).toHaveCount(0);
  await page.goto("/discover");
  await expect(page.getByRole("button", { name: "Şehir seçimi: İzmir", exact: true })).toBeVisible();
  await page.reload(); await expect(page.getByRole("button", { name: "Şehir seçimi: İzmir", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "İzmir kontrol salonu işletmesini aç", exact: true })).toBeVisible();
  await page.screenshot({ path: "artifacts/city-filter-native-20261017.png" });
});
test("manual Istanbul is intentional and an empty Ankara does not fall back", async ({ page }) => {
  await setup(page); await page.goto("/discover"); await choose(page, "İstanbul");
  await expect(page.getByRole("button", { name: "İstanbul kontrol salonu işletmesini aç", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "İzmir kontrol salonu işletmesini aç", exact: true })).toHaveCount(0);
  await choose(page, "Ankara"); await expect(page.getByText("Sonuç bulunamadı", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /kontrol salonu işletmesini aç/ })).toHaveCount(0);
});
test("city selector fits a 320px screen and closes without changing selection", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 760 }); await setup(page); await page.goto("/discover");
  await page.getByRole("button", { name: /^Şehir seçimi:/ }).click();
  const sheet = page.getByTestId("browse-city-sheet"); await sheet.getByLabel("Şehir ara").fill("İzmir");
  await sheet.getByRole("button", { name: "Şehir seçimini kapat", exact: true }).click();
  await expect(page.getByRole("button", { name: "Şehir seçimi: Tüm şehirler", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});
