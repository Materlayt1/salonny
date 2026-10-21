import { expect, test, type Page } from "@playwright/test";
import { business, mockApi } from "../e2e-mobile/fixtures";

async function login(page: Page) {
  await page.goto("/mobile/auth");
  await page.getByLabel("E-posta", { exact: true }).fill("customer@example.com");
  await page.getByLabel("Şifre", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Giriş yap", exact: true }).click();
  await expect(page).toHaveURL(/\/mobile\/?$/);
}

test("same-origin login, notification navigation and refresh keep the mobile subpath", async ({ page }) => {
  const errors: string[] = [];
  const requests: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (req) => { if (new URL(req.url()).pathname.startsWith("/api/")) requests.push(req.url()); });
  await mockApi(page);
  await login(page);
  await page.goto("/mobile/notifications");
  await page.getByRole("button", { name: "Randevun onaylandı, okunmadı" }).click();
  await expect(page).toHaveURL(/\/mobile\/appointments$/);
  await expect(page.getByText("Randevularım", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("Randevularım", { exact: true })).toBeVisible();
  expect(requests.some((url) => url.includes("/api/auth/supabase/token"))).toBe(true);
  expect(requests.every((url) => new URL(url).origin === "http://localhost:3001")).toBe(true);
  expect(errors).toEqual([]);
});

test("dynamic business URLs reload and booking remains in the native app", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await mockApi(page);
  await page.goto(`/mobile/business/${business.slug}`);
  await expect(page.getByRole("button", { name: "Randevu al", exact: true }).first()).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Hizmetler", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Randevu al", exact: true }).first().click();
  await expect(page).toHaveURL(new RegExp(`/mobile/booking/${business.slug}$`));
  expect(errors).toEqual([]);
});

test("management screens preserve business scope through a hard reload", async ({ page }) => {
  await mockApi(page, { businessAccount: true });
  await login(page);
  await page.goto(`/mobile/manage/reviews?businessId=${business.id}&branchId=${business.branchId}`);
  await expect(page.getByText("Kontrollü müşteri değerlendirmesi", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("Kontrollü müşteri değerlendirmesi", { exact: true })).toBeVisible();
});

test("missing module assets return 404, not a successful HTML fallback", async ({ request }) => {
  for (const path of ["/mobile/_expo/missing.js", "/mobile/manage/missing.js", "/mobile/missing.css"]) {
    const response = await request.get(path);
    expect(response.status()).toBe(404);
  }
  const response = await request.get("/mobile/auth");
  expect(response.status()).toBe(200);
  expect(response.headers()["x-robots-tag"]).toContain("noindex");
  const html = await response.text();
  expect(html).toContain("/mobile/_expo/");
  const script = /src="([^"]+entry-[^"]+\.js)"/.exec(html)?.[1];
  expect(script).toBeTruthy();
  const asset = await request.get(script!);
  expect(asset.status()).toBe(200);
  expect(asset.headers()["content-type"]).toMatch(/javascript/);
});

test("location consent restores the active CTA after reload and explicit disable stays disabled", async ({ page, context }) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 38.4237, longitude: 27.1428 });
  await mockApi(page);
  const queries: URL[] = [];
  page.on("request", (request) => { if (new URL(request.url()).pathname === "/api/businesses") queries.push(new URL(request.url())); });
  await page.goto("/mobile/discover?nearby=1");
  const action = page.getByRole("button", { name: "Konumumu kullan", exact: true });
  await expect(action).toBeVisible();
  expect(queries.some((query) => query.searchParams.has("lat"))).toBe(false);
  page.on("dialog", (dialog) => dialog.accept());
  await action.click();
  await expect.poll(() => queries.some((query) => query.searchParams.get("sort") === "nearest")).toBe(true);
  await page.goto("/mobile");
  const activeAction = page.getByRole("button", { name: "Yakınındaki işletmeleri gör", exact: true });
  await expect(activeAction).toBeVisible();
  await page.reload(); await expect(activeAction).toBeVisible();
  await activeAction.click();
  await page.getByRole("button", { name: "Konumu kapat", exact: true }).click();
  await page.goto("/mobile"); await page.reload();
  await expect(page.getByRole("button", { name: "Konumumu aç", exact: true })).toBeVisible();
});
