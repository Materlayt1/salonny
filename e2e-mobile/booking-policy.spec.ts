import { expect, test } from "@playwright/test";
import { business, businessId, mockApi, signIn } from "./fixtures";
const message = "Kendi işletmene müşteri hesabınla randevu alamazsın. İşletme panelinden başka müşteriler adına randevu oluşturabilirsin.";
const headers = { "Access-Control-Allow-Origin": "http://localhost:8082", "Access-Control-Allow-Headers": "authorization,content-type", "Access-Control-Allow-Methods": "GET,OPTIONS" };

for (const role of ["OWNER", "MANAGER", "EMPLOYEE"]) {
  test(`${role} sees a native self-booking block before choosing any slot`, async ({ page }) => {
    const writes = await mockApi(page, { businessAccount: true });
    await page.route("http://localhost:3001/api/booking-policy?**", (route) => route.fulfill({ headers, json: { businessId, allowed: false, code: "self_booking_forbidden", message } }));
    await signIn(page); await page.goto(`/booking/${business.slug}`);
    await expect(page.getByText("Kendi işletmene randevu alamazsın", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Uzman seçimine geç" })).toHaveCount(0);
    expect(writes).toHaveLength(0);
    await page.getByRole("button", { name: "İşletme paneline git" }).click();
    await expect(page).toHaveURL(new RegExp(`/manage/appointments\\?businessId=${businessId}`));
    await expect(page.getByRole("button", { name: "Müşteri adına randevu", exact: true })).toBeVisible();
  });
}
test("unavailable policy fails closed and can recover without submitting a booking", async ({ page }) => {
  const writes = await mockApi(page); let failed = true;
  await page.route("http://localhost:3001/api/booking-policy?**", (route) => route.fulfill({ headers, status: failed ? 503 : 200, json: failed ? { error: "Doğrulanamadı" } : { businessId, allowed: true } }));
  await signIn(page); await page.goto(`/booking/${business.slug}`);
  await expect(page.getByText("Randevu yetkisi doğrulanamadı", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Uzman seçimine geç" })).toHaveCount(0); expect(writes).toHaveLength(0);
  failed = false; await page.getByRole("button", { name: "Yeniden dene" }).click();
  await expect(page.getByRole("button", { name: "Uzman seçimine geç" })).toBeVisible();
});
test("a business account may still book another business normally", async ({ page }) => {
  await mockApi(page, { businessAccount: true }); await signIn(page); await page.goto(`/booking/${business.slug}`);
  await expect(page.getByRole("button", { name: "Uzman seçimine geç" })).toBeVisible();
  await expect(page.getByText("Kendi işletmene randevu alamazsın", { exact: true })).toHaveCount(0);
});
test("malformed or wrong-business policy cannot enable the booking form", async ({ page }) => {
  const writes = await mockApi(page);
  await page.route("http://localhost:3001/api/booking-policy?**", (route) => route.fulfill({ headers, json: { businessId: "wrong-business", allowed: true } }));
  await signIn(page); await page.goto(`/booking/${business.slug}`);
  await expect(page.getByText("Randevu yetkisi doğrulanamadı", { exact: true })).toBeVisible(); expect(writes).toHaveLength(0);
});
