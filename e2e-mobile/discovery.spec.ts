import { expect, test } from "@playwright/test";
import { mockApi, signIn } from "./fixtures";

test("static home protects typed searches until event handlers are ready", async ({ page }) => {
  const response = await page.request.get("/");
  expect(await response.text()).toMatch(/<input(?=[^>]*aria-label="Hizmet, işletme veya kategori ara")(?=[^>]*readonly)[^>]*>/i);
  await mockApi(page); await page.goto("/");
  await page.getByLabel("Hizmet, işletme veya kategori ara").fill("Kesim");
  await page.getByRole("button", { name: "Ara", exact: true }).click();
  await expect(page).toHaveURL(/q=Kesim/);
  await expect(page.getByLabel("İşletme veya hizmet ara")).toHaveValue("Kesim");
});

test("price shortcut selects the global price filter", async ({ page }) => {
  await mockApi(page); await page.goto("/");
  const priceRequest = page.waitForRequest((request) => request.url().includes("/api/businesses?") && new URL(request.url()).searchParams.get("sort") === "price");
  await page.getByRole("button", { name: "Uygun fiyat", exact: true }).first().click();
  await expect(page).toHaveURL(/sort=price/);
  await priceRequest;
});

test("nearby uses an explicitly requested, approximate synthetic location", async ({ page, context }) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 38.4237, longitude: 27.1428 });
  await mockApi(page);
  const queries: URL[] = [];
  page.on("request", (request) => { if (request.url().includes("/api/businesses?")) queries.push(new URL(request.url())); });
  await page.goto("/discover?nearby=1");
  expect(queries.some((query) => query.searchParams.has("lat"))).toBe(false);
  page.on("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Konumumu kullan", exact: true }).click();
  await expect.poll(() => queries.some((query) => query.searchParams.get("sort") === "nearest")).toBeTruthy();
  const located = queries.find((query) => query.searchParams.get("sort") === "nearest")!;
  expect(located.searchParams.get("lat")).toBe("38.42"); expect(located.searchParams.get("lng")).toBe("27.14");
  await page.getByRole("button", { name: "Konumu kapat", exact: true }).click();
  await expect(page.getByRole("button", { name: "En yakın", exact: true })).toHaveCount(0);
});

test("map loading is opt-in and list navigation remains available", async ({ page }) => {
  await mockApi(page); await page.goto("/");
  await expect(page.getByTestId("business-map")).toHaveCount(0);
  await page.getByRole("button", { name: "Haritayı aç", exact: true }).click();
  await expect(page.getByTestId("business-map")).toBeVisible();
  await page.getByRole("button", { name: "Haritada keşfet", exact: true }).click();
  await expect(page).toHaveURL(/map=1/);
  await expect(page.getByRole("button", { name: "Test salonu işletmesini aç", exact: true })).toBeAttached();
});

test("privacy and terms open as native readers instead of external pages", async ({ page, context }) => {
  await mockApi(page); await signIn(page); await page.goto("/profile");
  await page.getByRole("button", { name: /Gizlilik politikası/ }).click();
  await expect(page.getByText("Test hukuki metin içeriği.", { exact: true })).toBeVisible();
  expect(context.pages()).toHaveLength(1);
  await page.getByRole("button", { name: "Metni kapat" }).click();
  await expect(page.getByText("Test hukuki metin içeriği.", { exact: true })).toHaveCount(0);
});

test("direct shared map URLs hydrate without errors and pins open a real business card", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  await mockApi(page); await page.goto("/discover?map=1");
  await expect(page.getByTestId("business-map")).toBeVisible();
  await expect(page.getByRole("button", { name: "Test salonu, Bornova işletmesini seç", exact: true })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Test salonu, Bornova işletmesini seç", exact: true }).click();
  await expect(page.getByRole("button", { name: "Test salonu işletmesini aç", exact: true })).toHaveCount(2);
  expect(errors).toEqual([]);
});
