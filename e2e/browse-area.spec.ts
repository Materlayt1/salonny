import { expect, test } from "@playwright/test";
import { business } from "../e2e-mobile/fixtures";
const izmir = { ...business, name: "İzmir kontrol salonu", image: "/brand/salonny-mark.png" };
const istanbul = { ...business, id: "10000000-0000-4000-8000-000000000099", slug: "istanbul-kontrol", name: "İstanbul kontrol salonu", city: "İstanbul", district: "Kadıköy", lat: 41.01, lng: 28.98, image: "/brand/salonny-mark.png" };
function cityTrigger(page: import("@playwright/test").Page) { return page.getByRole("button", { name: /^Şehir seçimi:/ }).filter({ visible: true }).first(); }
async function chooseCity(page: import("@playwright/test").Page, city: string, trigger = cityTrigger(page)) {
  await trigger.click();
  const summary = page.getByRole("dialog", { name: "Arama bölgen", exact: true });
  await expect(summary).toBeVisible(); await expect(summary.getByLabel("Şehir ara")).toHaveCount(0);
  await summary.getByRole("button", { name: "Şehri değiştir", exact: true }).click();
  const picker = page.getByRole("dialog", { name: "Şehri değiştir", exact: true });
  await picker.getByLabel("Şehir ara").fill(city);
  await picker.getByRole("button", { name: city, exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}
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
  await chooseCity(page, "İzmir");
  const feed = page.getByTestId("home-business-directory");
  await expect(feed.getByRole("heading", { name: izmir.name, exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: istanbul.name, exact: true })).toHaveCount(0);
  await page.goto("/kesfet");
  await expect(cityTrigger(page)).toHaveAccessibleName("Şehir seçimi: İzmir");
  await page.reload();
  await expect(cityTrigger(page)).toHaveAccessibleName("Şehir seçimi: İzmir");
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
  await chooseCity(page, "İstanbul");
  await expect(feed.getByRole("heading", { name: istanbul.name, exact: true })).toBeVisible();
  await expect(feed.getByRole("heading", { name: izmir.name, exact: true })).toHaveCount(0);
});
test("an empty city never silently widens to populated cities", async ({ page }) => {
  await mockDirectory(page); await page.goto("/");
  await chooseCity(page, "Ankara");
  await expect(page.getByText("Ankara için henüz yayında işletme yok.", { exact: false })).toBeVisible();
  await expect(page.getByRole("heading", { name: izmir.name, exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: istanbul.name, exact: true })).toHaveCount(0);
});
test("area request failure does not leave stale other-city cards", async ({ page }) => {
  await mockDirectory(page, true); await page.goto("/");
  await chooseCity(page, "İzmir");
  await expect(page.getByRole("alert").filter({ hasText: "Bölgedeki işletmeler alınamadı" })).toBeVisible();
  await expect(page.getByTestId("home-business-directory").getByRole("article")).toHaveCount(0);
});

test("desktop header city opens region summary before choosing and restores focus on Escape", async ({ page }) => {
  test.skip(test.info().project.name === "mobile", "Desktop search header is hidden at the phone breakpoint; native flow is tested separately.");
  await mockDirectory(page); await page.goto("/kesfet");
  const trigger = page.getByRole("button", { name: /^Arama bölgesi:/ });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Arama bölgen", exact: true });
  await expect(dialog).toBeVisible(); await expect(dialog.getByLabel("Şehir ara")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Şehri değiştir", exact: true }).click();
  const picker = page.getByRole("dialog", { name: "Şehri değiştir", exact: true });
  await expect(picker.getByLabel("Şehir ara")).toBeFocused();
  await picker.getByLabel("Şehir ara").fill("izmir");
  await picker.getByRole("button", { name: "İzmir", exact: true }).click();
  await expect(trigger).toHaveAccessibleName("Arama bölgesi: İzmir");
  await expect(trigger).toBeFocused();
  await expect(cityTrigger(page)).toHaveAccessibleName("Şehir seçimi: İzmir");
  await trigger.click(); await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0); await expect(trigger).toBeFocused();
  await expect(page).toHaveURL(/\/kesfet$/);
});

test("home and directory use the native-style summary, cancel and searchable selected city", async ({ page }) => {
  await mockDirectory(page); await page.goto("/");
  await expect(page.getByRole("combobox", { name: "Şehir seçimi", exact: true })).toHaveCount(0);
  await chooseCity(page, "İzmir");
  const directoryTrigger = page.getByTestId("home-business-directory").getByRole("button", { name: "Şehir seçimi: İzmir", exact: true });
  await directoryTrigger.click();
  await page.getByRole("dialog", { name: "Arama bölgen", exact: true }).getByRole("button", { name: "Şehri değiştir", exact: true }).click();
  const picker = page.getByRole("dialog", { name: "Şehri değiştir", exact: true });
  await picker.getByLabel("Şehir ara").fill("izmir");
  await expect(picker.getByRole("button", { name: "İzmir", exact: true })).toHaveAttribute("aria-pressed", "true");
  await picker.getByLabel("Şehir ara").fill("unknown-city");
  await expect(picker.getByText("Şehir bulunamadı", { exact: true })).toBeVisible();
  await picker.getByRole("button", { name: "Aramayı temizle", exact: true }).click();
  await picker.getByRole("button", { name: "Bölge seçeneklerine dön", exact: true }).click();
  await page.getByRole("dialog", { name: "Arama bölgen", exact: true }).getByRole("button", { name: "Şehir seçimini kapat", exact: true }).click();
  await expect(directoryTrigger).toHaveAccessibleName("Şehir seçimi: İzmir"); await expect(directoryTrigger).toBeFocused();
  await expect(page.getByTestId("home-business-directory").getByRole("heading", { name: istanbul.name, exact: true })).toHaveCount(0);
});

test("discovery filter drawer uses the same picker and updates every visible city trigger", async ({ page }) => {
  await mockDirectory(page); await page.goto("/kesfet");
  if (test.info().project.name === "mobile") await page.getByLabel("Filtreler", { exact: true }).click();
  else await page.getByRole("button", { name: "Filtrele", exact: true }).click();
  const drawer = page.locator("aside").filter({ has: page.getByRole("heading", { name: "Filtreler", exact: true }) });
  await chooseCity(page, "İstanbul", drawer.getByRole("button", { name: /^Şehir seçimi:/ }));
  for (const trigger of await page.getByRole("button", { name: /^Şehir seçimi:/ }).filter({ visible: true }).all()) await expect(trigger).toHaveAccessibleName("Şehir seçimi: İstanbul");
  await page.reload(); await expect(cityTrigger(page)).toHaveAccessibleName("Şehir seçimi: İstanbul");
});

test("all cities is an explicit persistent choice even with a granted synthetic GPS location", async ({ page, context }) => {
  await context.setGeolocation({ latitude: 38.42373, longitude: 27.14282 }); await context.grantPermissions(["geolocation"]);
  await mockDirectory(page); await page.goto("/");
  const feed = page.getByTestId("home-business-directory");
  await expect(feed.getByRole("heading", { name: istanbul.name, exact: true })).toHaveCount(0);
  await cityTrigger(page).click(); await page.getByRole("dialog", { name: "Arama bölgen", exact: true }).getByRole("button", { name: "Tüm şehirleri göster", exact: true }).click();
  await expect(cityTrigger(page)).toHaveAccessibleName("Şehir seçimi: Tüm şehirler");
  await expect(feed.getByRole("heading", { name: istanbul.name, exact: true })).toBeVisible();
  await page.reload(); await expect(cityTrigger(page)).toHaveAccessibleName("Şehir seçimi: Tüm şehirler");
  await expect(feed.getByRole("heading", { name: istanbul.name, exact: true })).toBeVisible();
});

test("short landscape city summary keeps actions reachable without page overflow", async ({ page }) => {
  await page.setViewportSize({ width: 568, height: 320 }); await mockDirectory(page); await page.goto("/");
  const main = page.locator("#main-content");
  await main.evaluate((element) => { element.addEventListener("focus", () => element.setAttribute("data-city-pointer-focus", "unexpected"), { once: true }); });
  await cityTrigger(page).click();
  await expect(main).not.toHaveAttribute("data-city-pointer-focus", "unexpected");
  const dialog = page.getByRole("dialog", { name: "Arama bölgen", exact: true });
  await expect(dialog).toBeVisible();
  const all = dialog.getByRole("button", { name: "Tüm şehirleri göster", exact: true });
  await all.scrollIntoViewIfNeeded(); await expect(all).toBeInViewport({ ratio: 1 });
  const box = await all.boundingBox(); expect(box?.height).toBeGreaterThanOrEqual(44);
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0); await expect(cityTrigger(page)).toBeFocused();
  if (test.info().project.name === "mobile") {
    await cityTrigger(page).tap(); await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Şehir seçimini kapat", exact: true }).tap();
    await expect(dialog).toHaveCount(0); await expect(cityTrigger(page)).toBeFocused();
  }
});
