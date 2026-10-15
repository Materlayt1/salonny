import { expect, test } from "@playwright/test";

test("hero uses the new service photograph without causing horizontal overflow", async ({ page }, testInfo) => {
  await page.goto("/");
  if (testInfo.project.name === "chromium") {
    const image = page.getByRole("img", { name: "Aydınlık bir salonda müşterisinin saçını şekillendiren kuaför" });
    await expect(image).toBeVisible();
    await expect(image).toHaveAttribute("src", /salonny-hero-salon-v1/);
    await expect.poll(() => image.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test("previously granted location is restored on home, retained after discovery and on reload", async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Desktop hero card");
  await context.setGeolocation({ latitude: 38.42373, longitude: 27.14282 });
  await context.grantPermissions(["geolocation"]);
  await page.goto("/");
  const card = page.getByTestId("home-location-card");
  await expect(card.getByText("Konumun hazır", { exact: true })).toBeVisible();
  await expect(card.getByRole("button")).toHaveCount(0);
  await card.getByRole("link", { name: "Yakınımdakileri keşfet" }).click();
  await expect(page).toHaveURL(/\/kesfet\?nearby=1$/);
  await expect(page.getByRole("button", { name: "Konum açık", exact: true }).last()).toBeVisible();
  await page.getByRole("link", { name: "Salonny ana sayfa" }).first().click();
  await expect(card.getByText("Konumun hazır", { exact: true })).toBeVisible();
  await page.reload();
  await expect(card.getByText("Konumun hazır", { exact: true })).toBeVisible();
  await page.screenshot({ path: "artifacts/home-hero-location-ready-20261015.png" });
});

test("unknown permission does not trigger geolocation until an explicit click", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Desktop hero card");
  await page.addInitScript(() => {
    const permission = Object.assign(new EventTarget(), { state: "prompt" });
    Object.defineProperty(navigator, "permissions", { value: { query: async () => permission } });
    let requests = 0;
    Object.defineProperty(navigator, "geolocation", { value: { getCurrentPosition: () => { requests++; } } });
    Object.defineProperty(window, "__locationRequests", { get: () => requests });
  });
  await page.goto("/");
  const button = page.getByTestId("home-location-card").getByRole("button", { name: "Konumumu kullan", exact: true });
  await expect(button).toBeEnabled();
  expect(await page.evaluate(() => Reflect.get(window, "__locationRequests"))).toBe(0);
  await button.click();
  await expect(page.getByRole("button", { name: "Konum alınıyor…", exact: true })).toBeDisabled();
  expect(await page.evaluate(() => Reflect.get(window, "__locationRequests"))).toBe(1);
});

test("denied or unavailable fixes never show a misleading location-success card", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Desktop hero card");
  await page.addInitScript(() => {
    const permission = Object.assign(new EventTarget(), { state: "prompt" });
    Object.defineProperty(navigator, "permissions", { value: { query: async () => permission } });
    Object.defineProperty(navigator, "geolocation", { value: { getCurrentPosition: (_success: unknown, error: (value: { code: number }) => void) => error({ code: 1 }) } });
  });
  await page.goto("/");
  const card = page.getByTestId("home-location-card");
  await card.getByRole("button", { name: "Konumumu kullan", exact: true }).click();
  await expect(card.getByRole("alert")).toContainText("Konum izni kapalı");
  await expect(card.getByText("Konumun hazır", { exact: true })).toHaveCount(0);
  await expect(card.getByRole("link", { name: "Konumsuz keşfet", exact: true })).toBeVisible();
  await expect(card.getByRole("button", { name: "Konumu tekrar dene", exact: true })).toBeEnabled();
});
