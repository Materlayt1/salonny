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
  await sheet.getByRole("button", { name: "Şehri değiştir", exact: true }).click();
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
  const sheet = page.getByTestId("browse-city-sheet"); await sheet.getByRole("button", { name: "Şehri değiştir", exact: true }).click(); await sheet.getByLabel("Şehir ara").fill("İzmir");
  await sheet.getByRole("button", { name: "Şehir seçimini kapat", exact: true }).click();
  await expect(page.getByRole("button", { name: "Şehir seçimi: Tüm şehirler", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test("city name first opens a region summary, then an explicit change action", async ({ page }, testInfo) => {
  await setup(page); await page.goto("/"); await choose(page, "İzmir");
  await page.getByRole("button", { name: "Şehir seçimi: İzmir", exact: true }).click();
  const sheet = page.getByTestId("browse-city-sheet");
  await expect(sheet.getByRole("heading", { name: "Arama bölgen", exact: true })).toBeVisible();
  await expect(sheet.getByText("İzmir", { exact: true })).toBeVisible();
  await expect(sheet.getByLabel("Şehir ara")).toHaveCount(0);
  await expect(sheet.getByRole("button", { name: "Tüm şehirleri göster", exact: true })).toBeInViewport({ ratio: 1 });
  await page.screenshot({ path: testInfo.outputPath("city-summary.png"), animations: "disabled" });
  await sheet.getByRole("button", { name: "Şehri değiştir", exact: true }).click();
  await sheet.getByLabel("Şehir ara").fill("istanbul");
  await expect(sheet.getByRole("button", { name: "İstanbul", exact: true })).toBeVisible();
  await sheet.getByRole("button", { name: "Bölge seçeneklerine dön", exact: true }).click();
  await expect(sheet.getByLabel("Şehir ara")).toHaveCount(0);
  await expect(sheet.getByText("İzmir", { exact: true })).toBeVisible();
  await sheet.getByRole("button", { name: "Şehir seçimini kapat", exact: true }).click();
  await expect(page.getByRole("button", { name: "Şehir seçimi: İzmir", exact: true })).toBeVisible();
});

test("unknown city search offers recovery and the selected city stays checked", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 760 }); await setup(page); await page.goto("/discover"); await choose(page, "İzmir");
  await page.getByRole("button", { name: "Şehir seçimi: İzmir", exact: true }).click();
  const sheet = page.getByTestId("browse-city-sheet");
  await sheet.getByRole("button", { name: "Şehri değiştir", exact: true }).click();
  await sheet.getByLabel("Şehir ara").fill("izmir");
  await expect(sheet.getByRole("button", { name: "İzmir", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.screenshot({ path: testInfo.outputPath("city-picker.png"), animations: "disabled" });
  await sheet.getByLabel("Şehir ara").fill("qwerty");
  await expect(sheet.getByText("Şehir bulunamadı", { exact: true })).toBeVisible();
  await sheet.getByRole("button", { name: "Aramayı temizle", exact: true }).click();
  await expect(sheet.getByRole("button", { name: "Adana", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test("show all cities is deliberate and persists after the summary closes", async ({ page }) => {
  await setup(page); await page.goto("/discover"); await choose(page, "İzmir");
  await page.getByRole("button", { name: "Şehir seçimi: İzmir", exact: true }).click();
  await page.getByTestId("browse-city-sheet").getByRole("button", { name: "Tüm şehirleri göster", exact: true }).click();
  await expect(page.getByRole("button", { name: "Şehir seçimi: Tüm şehirler", exact: true })).toBeVisible();
  await page.reload(); await expect(page.getByRole("button", { name: "Şehir seçimi: Tüm şehirler", exact: true })).toBeVisible();
});

test("a late requested GPS result cannot replace the city chosen afterwards", async ({ page, context }) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 38.4237, longitude: 27.1428 });
  await page.addInitScript(() => {
    const original = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);
    navigator.geolocation.getCurrentPosition = (success, error, options) => original((position) => {
      const fixture = window as Window & { releaseCityGps?: () => void; cityGpsReady?: boolean; cityGpsDelivered?: boolean };
      fixture.releaseCityGps = () => { success(position); fixture.cityGpsDelivered = true; };
      fixture.cityGpsReady = true;
    }, error, options);
  });
  await setup(page); await page.goto("/discover"); await choose(page, "İzmir");
  await page.getByRole("button", { name: "Şehir seçimi: İzmir", exact: true }).click();
  await page.getByTestId("browse-city-sheet").getByRole("button", { name: "Konumumu kullan · 25 km", exact: true }).click();
  await expect.poll(() => page.evaluate(() => Boolean((window as Window & { cityGpsReady?: boolean }).cityGpsReady))).toBe(true);
  const sheet = page.getByTestId("browse-city-sheet");
  await sheet.getByRole("button", { name: "Şehri değiştir", exact: true }).click();
  await sheet.getByLabel("Şehir ara").fill("İstanbul");
  await sheet.getByRole("button", { name: "İstanbul", exact: true }).click();
  await page.evaluate(() => (window as Window & { releaseCityGps?: () => void }).releaseCityGps?.());
  await expect.poll(() => page.evaluate(() => Boolean((window as Window & { cityGpsDelivered?: boolean }).cityGpsDelivered))).toBe(true);
  await expect(page.getByRole("button", { name: "Şehir seçimi: İstanbul", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "İstanbul kontrol salonu işletmesini aç", exact: true })).toBeVisible();
  await page.reload(); await expect(page.getByRole("button", { name: "Şehir seçimi: İstanbul", exact: true })).toBeVisible();
});

test("short landscape view keeps region actions scrollable instead of clipping them", async ({ page }) => {
  await page.setViewportSize({ width: 568, height: 320 }); await setup(page); await page.goto("/");
  await page.getByRole("button", { name: /^Şehir seçimi:/ }).click();
  const sheet = page.getByTestId("browse-city-sheet");
  await expect(sheet.getByRole("heading", { name: "Arama bölgen", exact: true })).toBeVisible();
  const all = sheet.getByRole("button", { name: "Tüm şehirleri göster", exact: true });
  await all.scrollIntoViewIfNeeded(); await expect(all).toBeInViewport({ ratio: 1 });
  await all.click(); await expect(sheet).toHaveCount(0);
});
