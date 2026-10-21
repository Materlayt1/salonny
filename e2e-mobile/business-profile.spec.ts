import { expect, test } from "@playwright/test";
import { mockApi, signIn, business } from "./fixtures";

test.use({ deviceScaleFactor: 1, viewport: { width: 390, height: 844 } });
const open = async (page: import("@playwright/test").Page) => {
  await page.goto("/manage/settings");
  await page.getByRole("button", { name: "İşletme profili ve saatleri", exact: true }).click();
  await expect(page.getByLabel("İşletme adı", { exact: true })).toBeVisible();
};

test("native business profile validates fields and writes only the verified scoped profile", async ({ page, context }) => {
  const writes = await mockApi(page, { businessAccount: true }); await signIn(page); await open(page);
  await page.getByLabel("İşletme adı", { exact: true }).fill("A");
  await page.getByLabel("İşletme telefonu", { exact: true }).fill("123");
  await page.getByRole("button", { name: "Profili kaydet", exact: true }).click();
  await expect(page.getByText("En az 2 karakterlik işletme adını gir.", { exact: true })).toBeVisible();
  await expect(page.getByText("10–15 rakam içeren geçerli telefon numarasını gir.", { exact: true })).toBeVisible();
  expect(writes).toHaveLength(0);
  await page.getByLabel("İşletme adı", { exact: true }).fill("Kontrollü test salonu");
  await page.getByLabel("İşletme telefonu", { exact: true }).fill("0555 555 55 55");
  await page.getByLabel("İşletme açıklaması", { exact: true }).fill("Kontrollü test açıklaması");
  await page.getByRole("button", { name: "Profili kaydet", exact: true }).click();
  await expect(page.getByText("Kaydedildi.", { exact: true })).toBeVisible();
  await expect(page.getByLabel("İşletme adı", { exact: true })).toHaveValue("Kontrollü test salonu");
  expect(writes[0].body).toEqual({ action: "profile", name: "Kontrollü test salonu", phone: "0555 555 55 55", description: "Kontrollü test açıklaması" });
  expect(writes[0].authorization).toMatch(/^Bearer /);
  expect(new URL(writes[0].url).searchParams.get("businessId")).toBe(business.id);
  expect(new URL(writes[0].url).searchParams.get("branchId")).toBe(business.branchId);
  expect(context.pages()).toHaveLength(1);
});

test("native branch address corrects text without claiming to move the map pin", async ({ page }) => {
  const writes = await mockApi(page, { businessAccount: true }); await signIn(page); await open(page);
  await page.getByRole("button", { name: "İşletme adres", exact: true }).click();
  await expect(page.getByText(/Harita noktası değişmez/)).toBeVisible();
  await page.getByLabel("Şube açık adresi", { exact: true }).fill("Test Caddesi No: 12");
  await page.getByLabel("Şube ilçesi", { exact: true }).fill("Bornova");
  await page.getByLabel("Şube ili", { exact: true }).fill("İzmir");
  await page.getByRole("button", { name: "Şube adresini kaydet", exact: true }).click();
  await expect(page.getByText("Kaydedildi.", { exact: true })).toBeVisible();
  expect(writes[0].body).toEqual({ action: "address", addressLine: "Test Caddesi No: 12", district: "Bornova", city: "İzmir" });
});

test("native opening hours validate clocks, fit narrow phones and require confirmation", async ({ page }) => {
  const writes = await mockApi(page, { businessAccount: true }); await signIn(page); await open(page);
  await page.getByRole("button", { name: "İşletme saatler", exact: true }).click();
  await page.setViewportSize({ width: 320, height: 844 });
  const opening = await page.getByLabel("Pazartesi işletme açılış", { exact: true }).boundingBox();
  const closing = await page.getByLabel("Pazartesi işletme kapanış", { exact: true }).boundingBox();
  expect(opening!.x).toBeGreaterThanOrEqual(20); expect(closing!.x + closing!.width).toBeLessThanOrEqual(300); expect(opening!.y).toBe(closing!.y);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel("Pazartesi işletme kapanış", { exact: true }).fill("08:00");
  await page.getByRole("button", { name: "Çalışma saatlerini kaydet", exact: true }).click();
  await expect(page.getByText(/Açık günlerde saatleri SS:DD/)).toBeVisible(); expect(writes).toHaveLength(0);
  await page.getByLabel("Pazartesi işletme kapanış", { exact: true }).fill("16:30");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Çalışma saatlerini kaydet", exact: true }).click();
  expect(writes).toHaveLength(0);
  const accepted = new Promise<void>((resolve) => page.once("dialog", async (dialog) => { expect(dialog.message()).toContain("Mevcut randevular otomatik iptal edilmez"); await dialog.accept(); resolve(); }));
  await page.getByRole("button", { name: "Çalışma saatlerini kaydet", exact: true }).click(); await accepted;
  await expect(page.getByText("Kaydedildi.", { exact: true })).toBeVisible();
  const body = writes[0].body as { action: string; hours: unknown[]; confirmClosure: boolean };
  expect(body.action).toBe("hours"); expect(body.hours).toHaveLength(7); expect(body.hours[0]).toMatchObject({ weekday: 0, opensAt: "09:00", closesAt: "16:30", closed: false }); expect(body.confirmClosure).toBe(false);
  await page.getByText(/Saat dilimi:/).scrollIntoViewIfNeeded();
  await page.screenshot({ path: "artifacts/mobile-business-hours.jpg", type: "jpeg", quality: 95 });
});

test("advanced business hours are not overwritten by the weekly editor", async ({ page }) => {
  const writes = await mockApi(page, { businessAccount: true, advancedBusinessHours: true }); await signIn(page); await open(page);
  await page.getByRole("button", { name: "İşletme saatler", exact: true }).click();
  await expect(page.getByText(/Tarihe özel veya çok parçalı çalışma saatleri var/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Çalışma saatlerini kaydet", exact: true })).toBeDisabled();
  expect(writes).toHaveLength(0);
});

test("failed profile writes keep editable values and never display false success", async ({ page }) => {
  const writes = await mockApi(page, { businessAccount: true, profileWriteFailure: true }); await signIn(page); await open(page);
  await page.getByLabel("İşletme adı", { exact: true }).fill("Kaydedilmemiş salon");
  await page.getByRole("button", { name: "Profili kaydet", exact: true }).click();
  await expect(page.getByText("İşletme bilgileri kaydedilemedi. Yeniden dene.", { exact: true })).toBeVisible();
  await expect(page.getByLabel("İşletme adı", { exact: true })).toHaveValue("Kaydedilmemiş salon");
  await expect(page.getByRole("button", { name: "Profili kaydet", exact: true })).toBeEnabled();
  await expect(page.getByText("Kaydedildi.", { exact: true })).toHaveCount(0); expect(writes).toHaveLength(1);
});

test("discarding native profile edits is explicit", async ({ page }) => {
  const writes = await mockApi(page, { businessAccount: true }); await signIn(page); await open(page);
  await page.getByLabel("İşletme adı", { exact: true }).fill("Kaydedilmeyen düzenleme");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "İşletme profilini kapat", exact: true }).click();
  await expect(page.getByLabel("İşletme adı", { exact: true })).toHaveValue("Kaydedilmeyen düzenleme");
  const accepted = new Promise<void>((resolve) => page.once("dialog", async (dialog) => { await dialog.accept(); resolve(); }));
  await page.getByRole("button", { name: "İşletme profilini kapat", exact: true }).click(); await accepted;
  await expect(page.getByLabel("İşletme adı", { exact: true })).toHaveCount(0); expect(writes).toHaveLength(0);
});

test("ordinary employees cannot open business profile settings", async ({ page }) => {
  await mockApi(page, { businessAccount: true, employee: true }); await signIn(page); await page.goto("/manage/settings");
  await expect(page.getByText("Bölüm açılamadı", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "İşletme profili ve saatleri", exact: true })).toHaveCount(0);
  await expect(page.getByLabel("İşletme adı", { exact: true })).toHaveCount(0);
});

test("closing the entire business week needs an explicit warning and confirmed payload", async ({ page }) => {
  const writes = await mockApi(page, { businessAccount: true }); await signIn(page); await open(page);
  await page.getByRole("button", { name: "İşletme saatler", exact: true }).click();
  for (const day of ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"]) await page.getByLabel(`${day} işletme açık`, { exact: true }).uncheck();
  const accepted = new Promise<void>((resolve) => page.once("dialog", async (dialog) => { expect(dialog.message()).toContain("tüm hafta yeni randevuya kapalı"); await dialog.accept(); resolve(); }));
  await page.getByRole("button", { name: "Çalışma saatlerini kaydet", exact: true }).click(); await accepted;
  await expect(page.getByText("Kaydedildi.", { exact: true })).toBeVisible();
  expect(writes[0].body).toMatchObject({ action: "hours", confirmClosure: true });
  expect((writes[0].body as { hours: Array<{ closed: boolean; opensAt: unknown; closesAt: unknown }> }).hours.every((row) => row.closed && row.opensAt === null && row.closesAt === null)).toBe(true);
});

test("a branch without an existing map location gets an honest limitation rather than fake coordinates", async ({ page }) => {
  await mockApi(page, { businessAccount: true });
  await page.route("**/api/business-management/business-profile?**", async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    return route.fulfill({ json: { profile: { name: business.name, phone: "", description: "" }, location: null, hours: [], hasAdvancedHours: false, timezone: "Europe/Istanbul", branchName: "Merkez" }, headers: { "Access-Control-Allow-Origin": "http://localhost:8082" } });
  });
  await signIn(page); await open(page);
  await page.getByRole("button", { name: "İşletme adres", exact: true }).click();
  await expect(page.getByText("Kayıtlı konum bulunmuyor", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Şube adresini kaydet", exact: true })).toHaveCount(0);
});
