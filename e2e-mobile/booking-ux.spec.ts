import { expect, test, type Page } from "@playwright/test";
import { business, mockApi, signIn } from "./fixtures";

test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });

async function toDates(page: Page) {
  await page.getByRole("button", { name: "Uzman seçimine geç" }).click();
  await page.getByRole("button", { name: "Tarih seçimine geç" }).click();
  await expect(page.getByRole("heading", { name: "Sana uygun saati seç" })).toBeVisible();
}

async function toReview(page: Page) {
  await toDates(page);
  await page.getByRole("button", { name: /^\d{2}:\d{2}$/ }).click();
  await page.getByRole("button", { name: "Bilgileri kontrol et" }).click();
  await expect(page.getByLabel("Telefon", { exact: true })).toHaveValue("05555555555");
}

async function expectFixedFooter(page: Page) {
  const box = await page.getByTestId("booking-summary-footer").boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y).toBeGreaterThan(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(844);
  expect(box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
}

test("guided booking keeps its summary visible and validates contact fields beside their labels", async ({ page }) => {
  const writes = await mockApi(page);
  await signIn(page);
  await page.goto(`/booking/${business.slug}`);
  await expect(page.getByRole("heading", { name: "Hizmetini seç" })).toBeVisible();
  await expect(page.getByRole("button", { name: "4. Onay adımı" })).toBeDisabled();
  await expectFixedFooter(page);
  await page.getByRole("button", { name: "Uzman seçimine geç" }).click();
  await expect(page.getByRole("heading", { name: "Uzmanını seç" })).toBeVisible();
  await expectFixedFooter(page);
  await page.getByRole("button", { name: "Tarih seçimine geç" }).click();
  await expect(page.getByRole("button", { name: "Bilgileri kontrol et" })).toBeDisabled();
  await page.getByRole("button", { name: /^\d{2}:\d{2}$/ }).click();
  await expectFixedFooter(page);
  await page.getByRole("button", { name: "Bilgileri kontrol et" }).click();
  await expect(page.getByLabel("Telefon", { exact: true })).toHaveValue("05555555555");

  await page.getByLabel("Ad soyad", { exact: true }).fill("");
  await page.getByLabel("Telefon", { exact: true }).fill("123");
  await page.getByRole("button", { name: "Randevuyu oluştur" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Ad soyad en az 2 karakter olmalı." })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "geçerli bir telefon" })).toBeVisible();
  await expect(page.getByLabel("Ad soyad", { exact: true })).toHaveValue("");
  expect(writes.filter((write) => write.path === "/api/bookings")).toHaveLength(0);

  await page.getByLabel("Ad soyad", { exact: true }).fill("Güncel Müşteri");
  await page.getByLabel("Telefon", { exact: true }).fill("05555555555");
  await page.getByLabel("Telefon", { exact: true }).blur();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expectFixedFooter(page);
  await page.screenshot({ path: "artifacts/mobile-guided-booking-review.jpg", type: "jpeg", quality: 95 });
  const accepted = page.waitForEvent("dialog").then((dialog) => dialog.accept());
  await page.getByRole("button", { name: "Randevuyu oluştur" }).click();
  await accepted;
  await expect(page).toHaveURL(/\/appointments$/);
  const write = writes.find((item) => item.path === "/api/bookings");
  expect(write?.authorization).toMatch(/^Bearer /);
  expect(write?.key).toMatch(/^[0-9a-f-]{36}$/i);
  expect(write?.body).toMatchObject({ businessId: business.id, customer: { name: "Güncel Müşteri", phone: "05555555555" }, paymentMethod: "business" });
});

test("changing date, expert or service clears the previously selected slot", async ({ page }) => {
  const requests: URL[] = [];
  page.on("request", (request) => { if (new URL(request.url()).pathname === "/api/availability") requests.push(new URL(request.url())); });
  const writes = await mockApi(page, { extraBookingChoices: true });
  await signIn(page); await page.goto(`/booking/${business.slug}`);
  await page.getByRole("radio").nth(1).click();
  await page.getByRole("button", { name: "Uzman seçimine geç" }).click();
  await page.getByRole("radio").nth(1).click();
  await page.getByRole("button", { name: "Tarih seçimine geç" }).click();
  await page.getByRole("button", { name: /^\d{2}:\d{2}$/ }).click();
  await page.getByRole("button", { name: "Bilgileri kontrol et" }).click();

  await page.getByRole("button", { name: "3. Tarih adımı" }).click();
  await page.getByLabel("Randevu tarihleri").getByRole("button").nth(1).click();
  await expect(page.getByRole("button", { name: "Bilgileri kontrol et" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "4. Onay adımı" })).toBeDisabled();
  await page.getByRole("button", { name: /^\d{2}:\d{2}$/ }).click();
  await page.getByRole("button", { name: "Bilgileri kontrol et" }).click();

  await page.getByRole("button", { name: "2. Uzman adımı" }).click();
  await page.getByRole("radio").first().click();
  await page.getByRole("button", { name: "Tarih seçimine geç" }).click();
  await expect(page.getByRole("button", { name: "Bilgileri kontrol et" })).toBeDisabled();
  await page.getByRole("button", { name: /^\d{2}:\d{2}$/ }).click();
  await page.getByRole("button", { name: "Bilgileri kontrol et" }).click();

  await page.getByRole("button", { name: "1. Hizmet adımı" }).click();
  await page.getByRole("radio").first().click();
  await toDates(page);
  await expect(page.getByRole("button", { name: "Bilgileri kontrol et" })).toBeDisabled();
  await expect.poll(() => requests.at(-1)?.searchParams.get("serviceId")).toBe(business.services[0].id);
  expect(requests.at(-1)?.searchParams.get("employeeId")).toBe(business.employees[0].id);
  expect(writes.filter((write) => write.path === "/api/bookings")).toHaveLength(0);
});

test("a recoverable booking error preserves the draft and reuses the idempotency key", async ({ page }) => {
  const writes = await mockApi(page, { bookingError: "retry" });
  await signIn(page); await page.goto(`/booking/${business.slug}`);
  await toReview(page);
  await page.getByRole("button", { name: "Randevuyu oluştur" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "yeniden dene" })).toBeVisible();
  await expect(page.getByLabel("Ad soyad", { exact: true })).toHaveValue("Test Müşteri");
  const first = writes.find((write) => write.path === "/api/bookings");
  expect(first?.key).toMatch(/^[0-9a-f-]{36}$/i);
  const accepted = page.waitForEvent("dialog").then((dialog) => dialog.accept());
  await page.getByRole("button", { name: "Randevuyu oluştur" }).click();
  await accepted;
  await expect(page).toHaveURL(/\/appointments$/);
  const attempts = writes.filter((write) => write.path === "/api/bookings");
  expect(attempts).toHaveLength(2);
  expect(attempts[1].key).toBe(first!.key);
  expect(attempts[1].body).toEqual(first!.body);
});

test("a slot conflict returns to dates and requires an explicit new selection", async ({ page }) => {
  const writes = await mockApi(page, { bookingError: "conflict" });
  await signIn(page); await page.goto(`/booking/${business.slug}`);
  await toReview(page);
  await page.getByRole("button", { name: "Randevuyu oluştur" }).click();
  await expect(page.getByRole("heading", { name: "Sana uygun saati seç" })).toBeVisible();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("button", { name: "Bilgileri kontrol et" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "4. Onay adımı" })).toBeDisabled();
  await page.getByRole("button", { name: /^\d{2}:\d{2}$/ }).click();
  await page.getByRole("button", { name: "Bilgileri kontrol et" }).click();
  const accepted = page.waitForEvent("dialog").then((dialog) => dialog.accept());
  await page.getByRole("button", { name: "Randevuyu oluştur" }).click();
  await accepted;
  await expect(page).toHaveURL(/\/appointments$/);
  const attempts = writes.filter((write) => write.path === "/api/bookings");
  expect(attempts).toHaveLength(2);
  expect(attempts[1].key).not.toBe(attempts[0].key);
  expect((attempts[1].body as { startsAt: string }).startsAt).not.toBe((attempts[0].body as { startsAt: string }).startsAt);
});

test("an empty day offers useful alternatives instead of an actionable booking button", async ({ page }) => {
  const writes = await mockApi(page, { emptyAvailability: true });
  await signIn(page); await page.goto(`/booking/${business.slug}`);
  await toDates(page);
  await expect(page.getByText("Bu gün dolu görünüyor", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Bilgileri kontrol et" })).toBeDisabled();
  await page.getByRole("button", { name: "Sonraki güne bak" }).click();
  await expect(page.getByText("Bu gün dolu görünüyor", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Hizmeti değiştir" }).click();
  await expect(page.getByRole("heading", { name: "Hizmetini seç" })).toBeVisible();
  expect(writes.filter((write) => write.path === "/api/bookings")).toHaveLength(0);
});

test("the booking footer and large touch choices fit a 320px phone", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await mockApi(page); await signIn(page); await page.goto(`/booking/${business.slug}`);
  const choice = await page.getByRole("radio").first().boundingBox();
  expect(choice!.height).toBeGreaterThanOrEqual(44);
  await expectFixedFooter(page);
  await toReview(page);
  for (const field of ["Ad soyad", "Telefon"]) {
    const box = await page.getByLabel(field, { exact: true }).boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(20);
    expect(box!.x + box!.width).toBeLessThanOrEqual(300);
  }
  const button = await page.getByRole("button", { name: "Randevuyu oluştur" }).boundingBox();
  expect(button!.height).toBeGreaterThanOrEqual(44);
  await expectFixedFooter(page);
});
