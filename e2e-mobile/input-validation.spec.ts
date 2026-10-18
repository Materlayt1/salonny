import { expect, test } from "@playwright/test";
import { business, mockApi, signIn } from "./fixtures";

test("home category opens filtered discovery without changing the home directory", async ({ page }) => {
  await mockApi(page); await page.goto("/");
  await page.getByRole("button", { name: "Kuaför kategorisini keşfet", exact: true }).click();
  await expect(page).toHaveURL(/\/discover\?category=kuafor$/);
  await expect(page.getByRole("tab", { name: /Keşfet/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("button", { name: "Filtreler, 1 etkin" })).toBeVisible();
  await page.reload(); await expect(page.getByRole("button", { name: "Filtreler, 1 etkin" })).toBeVisible();
  await page.getByRole("tab", { name: /Ana Sayfa/ }).click();
  await expect(page.getByRole("button", { name: "Filtreler", exact: true })).toBeVisible();
});

test("profile rejects invalid numeric contact fields locally and keeps the draft", async ({ page }) => {
  const writes = await mockApi(page); await signIn(page); await page.goto("/profile-edit");
  await page.getByLabel("Telefon", { exact: true }).fill("abc123");
  await expect(page.getByLabel("Telefon", { exact: true })).toHaveValue("123");
  await page.getByRole("button", { name: "Bilgileri kaydet", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Telefon harf içeremez" })).toBeVisible();
  expect(writes.filter((row) => row.path === "/api/customer-profile")).toHaveLength(0);
  await page.getByLabel("Ad soyad", { exact: true }).fill("Çağrı123 Şen");
  await expect(page.getByLabel("Ad soyad", { exact: true })).toHaveValue("Çağrı Şen");
  await page.getByLabel("Telefon", { exact: true }).fill("+90 (555) 555-55-55");
  await page.getByLabel("Şehir", { exact: true }).fill("qwe123");
  await page.getByRole("button", { name: "Bilgileri kaydet", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "81 şehirden" })).toBeVisible();
  expect(writes.filter((row) => row.path === "/api/customer-profile")).toHaveLength(0);
  await page.getByLabel("Şehir", { exact: true }).fill("izmir");
  page.once("dialog", (dialog) => dialog.accept()); await page.getByRole("button", { name: "Bilgileri kaydet", exact: true }).click();
  await expect.poll(() => writes.filter((row) => row.path === "/api/customer-profile").length).toBe(1);
  expect(writes.find((row) => row.path === "/api/customer-profile")?.body).toEqual({ fullName: "Çağrı Şen", phone: "+90 (555) 555-55-55", city: "İzmir" });
});

test("booking contact phone filters letters before validation without creating a booking", async ({ page }) => {
  const writes = await mockApi(page); await signIn(page); await page.goto(`/booking/${business.slug}`);
  await page.getByRole("button", { name: "Uzman seçimine geç" }).click();
  await page.getByRole("button", { name: "Tarih seçimine geç" }).click();
  await page.getByRole("button", { name: /^\d{2}:\d{2}$/ }).click();
  await page.getByRole("button", { name: "Bilgileri kontrol et" }).click();
  await page.getByLabel("Telefon", { exact: true }).fill("abc123");
  await expect(page.getByLabel("Telefon", { exact: true })).toHaveValue("123");
  await page.getByLabel("Telefon", { exact: true }).blur();
  await expect(page.getByRole("alert").filter({ hasText: "geçerli bir telefon" })).toBeVisible();
  expect(writes.filter((row) => row.path === "/api/bookings")).toHaveLength(0);
});
