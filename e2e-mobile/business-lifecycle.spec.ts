import { expect, test } from "@playwright/test";
import { business, mockApi, signIn } from "./fixtures";

// All mutations and identity replies are intercepted fixtures. Never delete a real account.
test("withdrawn business has an explicit exit rather than a generic retry loop", async ({ page }) => {
  await mockApi(page);
  let reads = 0;
  await page.route(`http://localhost:3001/api/businesses/${business.slug}`, (route) => {
    reads++;
    return route.fulfill({ status: 404, headers: { "Access-Control-Allow-Origin": "http://localhost:8082" }, json: { code: "business_unavailable", error: "Yayında değil" } });
  });
  await page.goto(`/business/${business.slug}`);
  await expect(page.getByText("İşletme şu anda yayında değil", { exact: true })).toBeVisible();
  expect(reads).toBe(1);
  await expect(page.getByRole("button", { name: "Yeniden dene", exact: true })).toHaveCount(0);
  await page.screenshot({ path: "artifacts/mobile-business-withdrawn.png" });
  await page.getByRole("button", { name: "İşletmeleri keşfet", exact: true }).click();
  await expect(page).toHaveURL(/\/discover$/);
});

test("temporary detail failure remains retryable and is not presented as deletion", async ({ page }) => {
  await mockApi(page);
  let unavailable = true;
  await page.route(`http://localhost:3001/api/businesses/${business.slug}`, (route) => route.fulfill({ status: unavailable ? 503 : 200,
    headers: { "Access-Control-Allow-Origin": "http://localhost:8082" }, json: unavailable ? { error: "Geçici bağlantı sorunu" } : { business } }));
  await page.goto(`/business/${business.slug}`);
  await expect(page.getByRole("button", { name: "Yeniden dene", exact: true })).toBeVisible();
  await expect(page.getByText("İşletme şu anda yayında değil", { exact: true })).toHaveCount(0);
  unavailable = false;
  await page.getByRole("button", { name: "Yeniden dene", exact: true }).click();
  await expect(page.getByRole("button", { name: "Randevu al", exact: true })).toBeVisible();
});

test("withdrawn booking cannot advance to appointment creation", async ({ page }) => {
  const writes = await mockApi(page);
  await signIn(page);
  await page.route(`http://localhost:3001/api/businesses/${business.slug}`, (route) => route.fulfill({ status: 404,
    headers: { "Access-Control-Allow-Origin": "http://localhost:8082" }, json: { code: "business_unavailable", error: "Yayında değil" } }));
  await page.goto(`/booking/${business.slug}`);
  await expect(page.getByText("İşletme şu anda yayında değil", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Randevu oluştur", exact: true })).toHaveCount(0);
  expect(writes.filter((write) => write.path === "/api/bookings")).toHaveLength(0);
});

test("account deletion explains withdrawal and submits one authenticated request", async ({ page }) => {
  await mockApi(page, { businessAccount: true });
  let requests = 0;
  await page.route("http://localhost:3001/api/customer-profile", async (route) => {
    if (route.request().method() !== "DELETE") return route.fallback();
    requests++;
    expect(route.request().postDataJSON()).toEqual({ confirmed: true });
    expect(route.request().headers().authorization).toMatch(/^Bearer /);
    return route.fulfill({ headers: { "Access-Control-Allow-Origin": "http://localhost:8082" }, json: { requested: true, withdrawnBusinessCount: 1 } });
  });
  await signIn(page);
  await page.goto("/profile");
  const dialogs: string[] = [];
  page.on("dialog", async (dialog) => {
    dialogs.push(dialog.message());
    if (dialog.type() === "confirm") await dialog.accept(); else await dialog.dismiss();
  });
  await page.getByRole("button", { name: "Hesap silme talebi oluştur", exact: true }).click();
  await expect.poll(() => dialogs.length).toBe(2);
  expect(dialogs[0]).toContain("Hesabın ve mevcut randevuların hemen silinmez");
  expect(dialogs[1]).toContain("Talebin alındı");
  expect(dialogs[1]).toContain("Hesabın ve randevu geçmişin henüz silinmedi");
  expect(requests).toBe(1);
});

test("an incomplete deletion acknowledgement never claims the account was withdrawn", async ({ page }) => {
  await mockApi(page);
  await page.route("http://localhost:3001/api/customer-profile", async (route) => {
    if (route.request().method() !== "DELETE") return route.fallback();
    return route.fulfill({ headers: { "Access-Control-Allow-Origin": "http://localhost:8082" }, json: { saved: true } });
  });
  await signIn(page); await page.goto("/profile");
  const dialogs: string[] = [];
  page.on("dialog", async (dialog) => { dialogs.push(dialog.message()); if (dialog.type() === "confirm") await dialog.accept(); else await dialog.dismiss(); });
  await page.getByRole("button", { name: "Hesap silme talebi oluştur", exact: true }).click();
  await expect.poll(() => dialogs.length).toBe(2);
  expect(dialogs[1]).toContain("Talep oluşturulamadı");
  expect(dialogs[1]).not.toContain("Talebin alındı");
  await expect(page.getByRole("button", { name: "Hesap silme talebi oluştur", exact: true })).toBeEnabled();
});
