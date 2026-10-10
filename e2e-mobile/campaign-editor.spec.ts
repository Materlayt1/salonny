import { expect, test } from "@playwright/test";
import { business, mockApi, signIn } from "./fixtures";

test.use({ deviceScaleFactor: 1, viewport: { width: 390, height: 844 } });

test("native campaign creation validates fields and writes scoped atomic input without opening a browser", async ({ page, context }) => {
  const writes = await mockApi(page, { businessAccount: true }); await signIn(page); await page.goto("/manage/campaigns");
  await page.getByRole("button", { name: "Yeni kampanya", exact: true }).click();
  await page.getByRole("button", { name: "Kampanyayı oluştur", exact: true }).click();
  await expect(page.getByText("Kampanya adı 2–140 karakter olmalı.", { exact: true })).toBeVisible();
  expect(writes).toHaveLength(0);
  // The first validation click scrolls the long native form to its footer.
  // Return to the name field before editing, as a user would: iOS WebKit
  // can ignore fill on an offscreen input inside the native ScrollView.
  const campaignName = page.getByLabel("Kampanya adı", { exact: true });
  await campaignName.scrollIntoViewIfNeeded();
  await expect(campaignName).toBeVisible();
  await campaignName.fill("Sonbahar fırsatı");
  await expect(campaignName).toHaveValue("Sonbahar fırsatı");
  await page.getByLabel("Kampanya kodu", { exact: true }).fill("sonbahar20");
  await expect(page.getByLabel("Kampanya kodu", { exact: true })).toHaveValue("sonbahar20");
  await page.getByLabel("Kampanya indirim değeri", { exact: true }).fill("120");
  await page.getByRole("button", { name: "Kampanyayı oluştur", exact: true }).click();
  await expect(page.getByText("Yüzde 1–100 arasında tam sayı olmalı.", { exact: true })).toBeVisible();
  await expect(campaignName).toHaveValue("Sonbahar fırsatı");
  expect(writes).toHaveLength(0);
  const discountValue = page.getByLabel("Kampanya indirim değeri", { exact: true });
  await discountValue.scrollIntoViewIfNeeded();
  await discountValue.fill("20");
  await expect(discountValue).toHaveValue("20");
  await page.getByLabel("Kampanya başlangıcı", { exact: true }).fill("2026-10-15 09:00");
  await page.getByLabel("Kampanya bitişi", { exact: true }).fill("2026-10-14 18:00");
  await page.getByRole("button", { name: "Kampanyayı oluştur", exact: true }).click();
  await expect(page.getByText("Bitiş başlangıçtan sonra olmalı.", { exact: true })).toBeVisible();
  await expect(campaignName).toHaveValue("Sonbahar fırsatı");
  expect(writes).toHaveLength(0);
  await page.getByLabel("Kampanya bitişi", { exact: true }).fill("2026-10-31 18:00");
  await page.getByRole("button", { name: "Kampanyayı oluştur", exact: true }).click();
  await expect(page.getByRole("button", { name: "Kampanya ekranını kapat", exact: true })).toHaveCount(0);
  await expect(page.getByText("Sonbahar fırsatı", { exact: true })).toBeVisible();
  const write = writes.find((entry) => entry.path === "/api/business-management/campaign-editor")!;
  expect(write.body).toEqual({ action: "create", name: "Sonbahar fırsatı", code: "SONBAHAR20", kind: "percentage", value: 20, audience: "all", startsAt: "2026-10-15T06:00:00.000Z", endsAt: "2026-10-31T15:00:00.000Z" });
  expect(write.authorization).toMatch(/^Bearer /);
  expect(new URL(write.url).searchParams.get("businessId")).toBe(business.id);
  expect(new URL(write.url).searchParams.get("branchId")).toBe(business.branchId);
  expect(context.pages()).toHaveLength(1);
});

test("campaign metadata edits preserve discount terms and make the limitation clear", async ({ page }) => {
  const writes = await mockApi(page, { businessAccount: true }); await signIn(page); await page.goto("/manage/campaigns");
  await page.getByRole("button", { name: "Kampanya düzenle", exact: true }).click();
  await expect(page.getByLabel("Kampanya adı", { exact: true })).toHaveValue("Test kampanyası");
  await expect(page.getByText("İndirim koşulları korunuyor", { exact: true })).toBeVisible();
  await expect(page.getByText("TEST20 · %20", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Kampanya kodu", { exact: true })).toHaveCount(0);
  await page.getByLabel("Kampanya adı", { exact: true }).fill("Yeni müşteri fırsatı");
  await page.getByRole("button", { name: "Yeni müşteriler", exact: true }).click();
  await page.screenshot({ path: "artifacts/mobile-native-campaign-editor.jpg", type: "jpeg", quality: 92 });
  await page.getByRole("button", { name: "Kampanya bilgilerini kaydet", exact: true }).click();
  await expect(page.getByRole("button", { name: "Kampanya ekranını kapat", exact: true })).toHaveCount(0);
  await expect(page.getByText("Yeni müşteri fırsatı", { exact: true })).toBeVisible();
  expect(writes[0].body).toEqual({ action: "editMetadata", id: "10000000-0000-4000-8000-000000000002", name: "Yeni müşteri fırsatı", audience: "new" });
});

test("failed campaign saves preserve the form and allow a safe retry or close", async ({ page }) => {
  await mockApi(page, { businessAccount: true, campaignWriteFailure: true }); await signIn(page); await page.goto("/manage/campaigns");
  await page.getByRole("button", { name: "Yeni kampanya", exact: true }).click();
  await page.getByLabel("Kampanya adı", { exact: true }).fill("Fırsat");
  await page.getByLabel("Kampanya kodu", { exact: true }).fill("FIXED100");
  await page.getByRole("button", { name: "Sabit TL indirimi", exact: true }).click();
  await page.getByLabel("Kampanya indirim değeri", { exact: true }).fill("100");
  await page.getByRole("button", { name: "Kampanyayı oluştur", exact: true }).click();
  await expect(page.getByText("Kampanya kaydedilemedi. Yeniden dene.", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Kampanya adı", { exact: true })).toHaveValue("Fırsat");
  await expect(page.getByRole("button", { name: "Kampanyayı oluştur", exact: true })).toBeEnabled();
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Kampanya ekranını kapat", exact: true }).click();
  await expect(page.getByLabel("Kampanya adı", { exact: true })).toBeVisible();
  const accepted = page.waitForEvent("dialog").then((dialog) => dialog.accept());
  await page.getByRole("button", { name: "Kampanya ekranını kapat", exact: true }).click(); await accepted;
  await expect(page.getByLabel("Kampanya adı", { exact: true })).toHaveCount(0);
});

test("wrong selected tenant cannot submit campaign creation", async ({ page }) => {
  const writes = await mockApi(page, { businessAccount: true, campaignWrongScope: true }); await signIn(page); await page.goto("/manage/campaigns");
  await page.getByRole("button", { name: "Yeni kampanya", exact: true }).click();
  await expect(page.getByText(/Seçili işletmede oluşturma desteklenmiyor/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Kampanyayı oluştur", exact: true })).toHaveCount(0);
  expect(writes).toHaveLength(0);
});

test("employees with no campaign rights are denied at the native screen", async ({ page }) => {
  await mockApi(page, { businessAccount: true, employee: true }); await signIn(page); await page.goto("/manage/campaigns");
  await expect(page.getByRole("button", { name: "Yeni kampanya", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Kampanya düzenle", exact: true })).toHaveCount(0);
  await expect(page.getByText("Bu bölüm mevcut değil veya erişim yetkin bulunmuyor.", { exact: true })).toBeVisible();
});
