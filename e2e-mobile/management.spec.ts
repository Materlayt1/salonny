import { expect, test } from "@playwright/test";
import { mockApi, signIn, business, appointmentId } from "./fixtures";

test("business profile opens a native panel without creating an external tab", async ({ page, context }) => {
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  await mockApi(page, { businessAccount: true }); await signIn(page); await page.goto("/profile");
  await page.getByRole("button", { name: /İşletme paneli/ }).click();
  await expect(page).toHaveURL(/localhost:8082\/manage\/dashboard$/);
  await expect(page.getByText("Bugünkü randevular", { exact: true }).first()).toBeVisible();
  expect(context.pages()).toHaveLength(1);
  await page.getByRole("button", { name: "İşletme menüsünü aç" }).click();
  await page.getByRole("button", { name: "Hizmetler", exact: true }).click();
  await expect(page.getByText("Saç kesimi", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("native service edits use bearer authentication and verified business scope", async ({ page }) => {
  const writes = await mockApi(page, { businessAccount: true }); await signIn(page); await page.goto("/manage/services");
  await page.getByRole("button", { name: "Düzenle", exact: true }).click();
  await page.getByLabel("Hizmet adı").fill("Güncellenmiş hizmet");
  await page.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect.poll(() => writes.some((write) => write.path === "/api/business-management/services")).toBeTruthy();
  expect(writes.find((write) => write.path === "/api/business-management/services")?.body).toMatchObject({ id: business.services[0].id, name: "Güncellenmiş hizmet", durationMinutes: 30, price: 400 });
  expect(writes.find((write) => write.path === "/api/business-management/services")?.authorization).toMatch(/^Bearer /);
  expect(new URL(writes.find((write) => write.path === "/api/business-management/services")!.url).searchParams.get("businessId")).toBe(business.id);
  await expect(page.getByLabel("Hizmet adı")).toHaveCount(0);
});

test("branch switching replaces data and scopes the next write to that branch", async ({ page }) => {
  const writes = await mockApi(page, { businessAccount: true }); await signIn(page); await page.goto("/manage/services");
  await page.getByRole("button", { name: "İşletme menüsünü aç" }).click();
  await page.getByText("İkinci şube", { exact: true }).click();
  await expect(page.getByText("İkinci şube hizmeti", { exact: true })).toBeVisible();
  let query = "";
  page.on("request", (request) => { if (request.method() === "POST" && request.url().includes("/business-management/")) query = request.url(); });
  await page.getByRole("button", { name: "Düzenle", exact: true }).click();
  await page.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect.poll(() => writes.length).toBeGreaterThan(0);
  expect(new URL(query).searchParams.get("branchId")).toBe(appointmentId);
  expect(new URL(query).searchParams.get("businessId")).toBe(business.id);
});

test("staff cannot see owner-only navigation or edit services", async ({ page }) => {
  await mockApi(page, { businessAccount: true, employee: true }); await signIn(page); await page.goto("/manage/services");
  await expect(page.getByText("Saç kesimi", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Düzenle", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Yeni kayıt ekle" })).toHaveCount(0);
  await page.getByRole("button", { name: "İşletme menüsünü aç" }).click();
  await expect(page.getByRole("button", { name: "Ayarlar", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Raporlar", exact: true })).toHaveCount(0);
});

test("home keeps curated rails above the filtered feed and passes shortcuts to discovery", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  await mockApi(page); await page.goto("/");
  await expect(page.getByText("Bugün neye ihtiyacın var?", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Salonny logosu").first()).toBeVisible();
  await expect(page.getByRole("tab", { name: "Profilim", exact: true })).toBeVisible();
  await page.getByLabel("Hizmet, işletme veya kategori ara").fill("Saç");
  await page.getByRole("button", { name: "Ara", exact: true }).click();
  await expect(page.getByLabel("İşletme veya hizmet ara")).toHaveValue("Saç");
  expect(errors).toEqual([]);
});
