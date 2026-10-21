import { expect, test, type Page } from "@playwright/test";
import { business, mockApi, signIn } from "./fixtures";
test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
async function coupons(page: Page, used = false) {
  const quotes: unknown[] = [];
  await page.route("http://localhost:3001/api/coupons**", async (route) => {
    const request = route.request(); const headers = { "Access-Control-Allow-Origin": "http://localhost:8082", "Access-Control-Allow-Headers": "authorization,content-type", "Access-Control-Allow-Methods": "GET,POST,OPTIONS" };
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    if (request.method() === "GET") return route.fulfill({ headers, json: { offers: [{ code: "TEST10", kind: "percentage", value: 10, audience: "all", endsAt: null }] } });
    quotes.push(request.postDataJSON());
    return route.fulfill({ status: used ? 409 : 200, headers, json: used ? { error: "Bu kuponu daha önce kullandın.", code: "coupon_already_used" } : { code: "TEST10", subtotalMinor: 50000, discountMinor: 5000, totalMinor: 45000, currency: "TRY" } });
  });
  return quotes;
}
async function review(page: Page) {
  await signIn(page); await page.goto(`/booking/${business.slug}`);
  await page.getByRole("button", { name: "Uzman seçimine geç" }).click();
  await page.getByRole("button", { name: "Tarih seçimine geç" }).click();
  await page.getByRole("button", { name: /^\d{2}:\d{2}$/ }).click();
  await page.getByRole("button", { name: "Bilgileri kontrol et" }).click();
}
test("native coupon changes summary and sends only normalized code with booking", async ({ page }) => {
  const writes = await mockApi(page); const quotes = await coupons(page); await review(page);
  await page.getByLabel("Kupon kodu", { exact: true }).fill("test10");
  await expect(page.getByRole("button", { name: "Randevuyu oluştur", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Kuponu uygula", exact: true }).click();
  await expect(page.getByText(/TEST10 uygulandı/)).toBeVisible();
  await expect(page.getByTestId("booking-summary-footer")).toContainText("450");
  expect(quotes[0]).toMatchObject({ businessId: business.id, branchId: business.branchId, code: "test10" });
  await page.screenshot({ path: "artifacts/mobile-customer-coupon.jpg", type: "jpeg", quality: 92 });
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Randevuyu oluştur", exact: true }).click();
  await expect(page).toHaveURL(/\/appointments$/);
  expect(writes.find((write) => write.path === "/api/bookings")?.body).toMatchObject({ couponCode: "TEST10" });
});
test("consumed coupon leaves booking intact and must be removed before proceeding", async ({ page }) => {
  const writes = await mockApi(page); await coupons(page, true); await review(page);
  await page.getByLabel("Kupon kodu", { exact: true }).fill("TEST10");
  await page.getByRole("button", { name: "Kuponu uygula", exact: true }).click();
  await expect(page.getByText("Bu kuponu daha önce kullandın.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Randevuyu oluştur", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Kuponu kaldır", exact: true }).click();
  await expect(page.getByRole("button", { name: "Randevuyu oluştur", exact: true })).toBeEnabled();
  expect(writes).toHaveLength(0);
});
test("customer business detail advertises current code and one-use condition", async ({ page }) => {
  await mockApi(page); await coupons(page); await page.goto(`/business/${business.slug}`);
  await expect(page.getByText("TEST10 koduyla %10 indirim", { exact: true })).toBeVisible();
  await expect(page.getByText(/Her müşteri yalnız bir kez kullanabilir/)).toBeVisible();
});

test("changing expert and returning does not resurrect a cleared coupon", async ({ page }) => {
  const writes = await mockApi(page, { extraBookingChoices: true }); await coupons(page); await review(page);
  await page.getByLabel("Kupon kodu", { exact: true }).fill("TEST10");
  await page.getByRole("button", { name: "Kuponu uygula", exact: true }).click();
  await expect(page.getByTestId("booking-summary-footer")).toContainText("450");
  await page.getByRole("button", { name: "2. Uzman adımı" }).click();
  await page.getByRole("radio", { name: "İkinci uzman", exact: true }).click();
  await page.getByRole("radio", { name: "Test uzmanı", exact: true }).click();
  await page.getByRole("button", { name: "Tarih seçimine geç" }).click();
  await page.getByRole("button", { name: /^\d{2}:\d{2}$/ }).click();
  await page.getByRole("button", { name: "Bilgileri kontrol et" }).click();
  await expect(page.getByLabel("Kupon kodu", { exact: true })).toHaveValue("");
  await expect(page.getByTestId("booking-summary-footer")).toContainText("400");
  await expect(page.getByText(/TEST10 uygulandı/)).toHaveCount(0);
  expect(writes).toHaveLength(0);
});

test("late quote from an abandoned selection cannot restore its discount", async ({ page }) => {
  await mockApi(page, { extraBookingChoices: true }); await coupons(page);
  let release!: () => void; let requested = false; let answered = false;
  const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route("http://localhost:3001/api/coupons**", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    requested = true; await held;
    await route.fulfill({ headers: { "Access-Control-Allow-Origin": "http://localhost:8082" }, json: { code: "TEST10", subtotalMinor: 50000, discountMinor: 5000, totalMinor: 45000, currency: "TRY" } });
    answered = true;
  });
  await review(page); await page.getByLabel("Kupon kodu", { exact: true }).fill("TEST10");
  await page.getByRole("button", { name: "Kuponu uygula", exact: true }).click();
  await expect.poll(() => requested).toBe(true);
  await page.getByRole("button", { name: "2. Uzman adımı" }).click();
  await page.getByRole("radio", { name: "İkinci uzman", exact: true }).click();
  await page.getByRole("radio", { name: "Test uzmanı", exact: true }).click();
  release(); await expect.poll(() => answered).toBe(true);
  await page.getByRole("button", { name: "Tarih seçimine geç" }).click();
  await page.getByRole("button", { name: /^\d{2}:\d{2}$/ }).click();
  await page.getByRole("button", { name: "Bilgileri kontrol et" }).click();
  await expect(page.getByLabel("Kupon kodu", { exact: true })).toHaveValue("");
  await expect(page.getByTestId("booking-summary-footer")).toContainText("400");
  await expect(page.getByText(/TEST10 uygulandı/)).toHaveCount(0);
});
