import { expect, test } from "@playwright/test";
import { business } from "../e2e-mobile/fixtures";
const izmir = { ...business, name: "İzmir kontrol salonu", image: "/brand/salonny-mark.png" };
const istanbul = { ...business, id: "10000000-0000-4000-8000-000000000099", slug: "istanbul-kontrol", name: "İstanbul kontrol salonu", city: "İstanbul", district: "Kadıköy", lat: 41.01, lng: 28.98, image: "/brand/salonny-mark.png" };
async function mockDirectory(page: import("@playwright/test").Page, fail = false) {
  await page.route("**/api/businesses?**", async (route) => {
    const params = new URL(route.request().url()).searchParams;
    const city = params.get("city");
    const scoped = Boolean(city || params.has("radius"));
    const items = city === "Ankara" ? [] : city === "İstanbul" ? [istanbul] : scoped ? [izmir] : [izmir, istanbul];
    await route.fulfill({ status: fail && scoped ? 503 : 200, json: fail && scoped ? { error: "Geçici hata" } : { businesses: items, total: items.length, hasMore: false } });
  });
  await page.route("https://tile.openstreetmap.org/**", (route) => route.abort());
}
test("selected city is shared by all home rails, directory, discovery and reload", async ({ page }) => {
  await mockDirectory(page); await page.goto("/");
  await page.getByLabel("Şehir seçimi").first().selectOption("İzmir");
  const feed = page.getByTestId("home-business-directory");
  await expect(feed.getByRole("heading", { name: izmir.name, exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: istanbul.name, exact: true })).toHaveCount(0);
  await page.goto("/kesfet");
  await expect(page.getByLabel("Şehir seçimi").filter({ visible: true }).first()).toHaveValue("İzmir");
  await page.reload();
  await expect(page.getByLabel("Şehir seçimi").filter({ visible: true }).first()).toHaveValue("İzmir");
  if (test.info().project.name === "mobile") await page.getByTestId("mobile-sheet-handle").click();
  await expect(page.getByRole("heading", { name: izmir.name, exact: true }).filter({ visible: true }).first()).toBeVisible();
  await page.screenshot({ path: `artifacts/city-filter-web-${test.info().project.name}-20261017.png` });
});
test("Izmir GPS excludes Istanbul but explicit Istanbul overrides GPS", async ({ page, context }) => {
  await context.setGeolocation({ latitude: 38.42373, longitude: 27.14282 }); await context.grantPermissions(["geolocation"]);
  await mockDirectory(page); await page.goto("/");
  const feed = page.getByTestId("home-business-directory");
  await expect(feed.getByRole("heading", { name: izmir.name, exact: true })).toBeVisible();
  await expect(feed.getByRole("heading", { name: istanbul.name, exact: true })).toHaveCount(0);
  await page.getByLabel("Şehir seçimi").first().selectOption("İstanbul");
  await expect(feed.getByRole("heading", { name: istanbul.name, exact: true })).toBeVisible();
  await expect(feed.getByRole("heading", { name: izmir.name, exact: true })).toHaveCount(0);
});
test("an empty city never silently widens to populated cities", async ({ page }) => {
  await mockDirectory(page); await page.goto("/");
  await page.getByLabel("Şehir seçimi").first().selectOption("Ankara");
  await expect(page.getByText("Ankara için henüz yayında işletme yok.", { exact: false })).toBeVisible();
  await expect(page.getByRole("heading", { name: izmir.name, exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: istanbul.name, exact: true })).toHaveCount(0);
});
test("area request failure does not leave stale other-city cards", async ({ page }) => {
  await mockDirectory(page, true); await page.goto("/");
  await page.getByLabel("Şehir seçimi").first().selectOption("İzmir");
  await expect(page.getByRole("alert").filter({ hasText: "Bölgedeki işletmeler alınamadı" })).toBeVisible();
  await expect(page.getByTestId("home-business-directory").getByRole("article")).toHaveCount(0);
});
