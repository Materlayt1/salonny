import { expect, test } from "@playwright/test";
import { appointmentId, business, mockApi, signIn } from "./fixtures";

test("a customer cancels a booking only after confirmation", async ({ page }) => {
  const writes = await mockApi(page);
  await signIn(page);
  await page.goto(`/appointment/${appointmentId}`);
  await expect(page.getByRole("button", { name: "Randevuyu iptal et" })).toBeVisible();
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Randevuyu iptal et" }).click();
  expect(writes).toHaveLength(0);
  page.on("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Randevuyu iptal et" }).click();
  await expect.poll(() => writes.some((write) => write.path === `/api/appointments/${appointmentId}` && write.method === "PATCH")).toBeTruthy();
  await expect(page.getByRole("button", { name: "Randevuyu iptal et" })).toHaveCount(0);
});

test("a customer chooses an available reschedule slot", async ({ page }) => {
  const writes = await mockApi(page);
  await signIn(page); await page.goto(`/appointment/${appointmentId}`);
  await page.getByRole("button", { name: "Tarih ve saati değiştir" }).click();
  await expect(page.getByRole("button", { name: "Yeni saati kaydet" })).toBeDisabled();
  await page.getByRole("button", { name: /^\d{2}:\d{2}$/ }).click();
  const accepted = page.waitForEvent("dialog").then((dialog) => dialog.accept());
  await page.getByRole("button", { name: "Yeni saati kaydet" }).click();
  await accepted;
  await expect.poll(() => writes.some((write) => (write.body as { action?: string }).action === "reschedule")).toBeTruthy();
  await expect(page.getByRole("button", { name: "Yeni saati kaydet" })).toHaveCount(0);
});

test("completed appointments accept a verified review", async ({ page }) => {
  const writes = await mockApi(page, { completed: true });
  await signIn(page); await page.goto(`/appointment/${appointmentId}`);
  await expect(page.getByRole("button", { name: "Randevuyu iptal et" })).toHaveCount(0);
  await page.getByLabel("Değerlendirmen").fill("İyi bir deneyimdi.");
  const accepted = page.waitForEvent("dialog").then((dialog) => dialog.accept());
  await page.getByRole("button", { name: "Değerlendirmeyi gönder" }).click();
  await accepted;
  await expect.poll(() => writes.some((write) => write.path === "/api/reviews")).toBeTruthy();
  await expect(page.getByText("Değerlendirmen · 5 ★")).toBeVisible();
});

test("profile changes and notifications use the authenticated API", async ({ page }) => {
  const writes = await mockApi(page);
  await signIn(page); await page.goto("/profile-edit");
  await page.getByLabel("Ad soyad").fill("Güncel Müşteri");
  const accepted = page.waitForEvent("dialog").then((dialog) => dialog.accept());
  await page.getByRole("button", { name: "Bilgileri kaydet" }).click();
  await accepted;
  await expect.poll(() => writes.some((write) => write.path === "/api/customer-profile" && write.method === "PATCH")).toBeTruthy();
  await page.goto("/notifications");
  await page.getByRole("button", { name: "Tümünü okundu işaretle" }).click();
  await expect.poll(() => writes.some((write) => write.path === "/api/notifications")).toBeTruthy();
});

test("booking is submitted with a native-safe idempotency key", async ({ page }) => {
  const writes = await mockApi(page);
  await signIn(page); await page.goto(`/booking/${business.slug}`);
  await page.getByRole("button", { name: "Uzman seçimine geç" }).click();
  await page.getByRole("button", { name: "Tarih seçimine geç" }).click();
  await page.getByRole("button", { name: /^\d{2}:\d{2}$/ }).click();
  await page.getByRole("button", { name: "Bilgileri kontrol et" }).click();
  await expect(page.getByLabel("Telefon", { exact: true })).toHaveValue("05555555555");
  page.on("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Randevuyu oluştur" }).click();
  await expect.poll(() => writes.some((write) => write.path === "/api/bookings")).toBeTruthy();
  expect(writes.find((write) => write.path === "/api/bookings")?.key).toMatch(/^[0-9a-f-]{36}$/i);
  await expect(page).toHaveURL(/\/appointments$/);
});
