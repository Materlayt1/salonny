import { expect, test, type Page } from "@playwright/test";
import { appointmentId, business, mockApi, signIn, userId } from "./fixtures";

type Draft = { customerId: string; serviceId: string; employeeId: string; startsAt: string; idempotencyKey: string };
async function setup(page: Page, options: { failure?: "retry" | "conflict"; empty?: boolean; lookupError?: boolean; employee?: boolean } = {}) {
  await mockApi(page, { businessAccount: true, employee: options.employee });
  const requests: URL[] = []; const writes: { body: Draft; url: URL; authorization?: string }[] = [];
  let slot = new Date(Date.now() + 4 * 86_400_000).toISOString();
  let failed = false;
  await page.route("http://localhost:3001/api/business-management/booking-editor?**", async (route) => {
    const request = route.request(); const url = new URL(request.url());
    const headers = { "Access-Control-Allow-Origin": "http://localhost:8082", "Access-Control-Allow-Headers": "authorization,content-type", "Access-Control-Allow-Methods": "GET,POST,OPTIONS" };
    const respond = (data: unknown, status = 200) => route.fulfill({ status, headers, json: data });
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    requests.push(url);
    if (request.method() === "POST") {
      writes.push({ body: request.postDataJSON(), url, authorization: request.headers().authorization });
      if (!failed && options.failure) {
        failed = true;
        if (options.failure === "conflict") slot = new Date(Date.parse(slot) + 3_600_000).toISOString();
        return respond({ error: options.failure === "retry" ? "Randevu oluşturma yanıtı alınamadı. Yeniden dene." : "Bu saat artık müsait değil. Yeni bir saat seç." }, options.failure === "retry" ? 503 : 409);
      }
      return respond({ saved: true, id: appointmentId }, 201);
    }
    const kind = url.searchParams.get("kind");
    if (kind === "customers" && options.lookupError && !failed) { failed = true; return respond({ error: "Müşteri seçenekleri yüklenemedi." }, 503); }
    if (kind === "slots") return respond({ slots: options.empty ? [] : [slot], timezone: "Europe/Istanbul", quote: { durationMinutes: 30, priceMinor: 40000, currency: "TRY" } });
    const rows = kind === "customers" ? [{ id: userId, title: "Test Müşteri", subtitle: "05555555555" }] : kind === "services" ? [{ id: business.services[0].id, title: "Saç kesimi", durationMinutes: 30, priceMinor: 40000, currency: "TRY" }] : [{ id: business.employees[0].id, title: "Test uzmanı", subtitle: "Uzman" }];
    return respond({ rows, hasMore: false });
  });
  await signIn(page);
  // Exercise the real native navigation. A dynamic route deep link on the
  // standalone static preview otherwise receives the index.html SSR fallback.
  await page.getByRole("tab", { name: "Profilim", exact: true }).click();
  await page.getByRole("button", { name: /İşletme paneli/ }).click();
  await page.getByRole("button", { name: "İşletme menüsünü aç", exact: true }).click();
  await page.getByRole("button", { name: "Randevular", exact: true }).click();
  await expect(page).toHaveURL(/\/manage\/appointments$/);
  return { requests, writes };
}

async function toDates(page: Page) {
  await page.getByRole("button", { name: "Müşteri adına randevu", exact: true }).click();
  await expect(page.getByRole("button", { name: "Devam", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Müşteri seç: Test Müşteri", exact: true }).click();
  await page.getByRole("button", { name: "Devam", exact: true }).click();
  await page.getByRole("button", { name: "Hizmet seç: Saç kesimi", exact: true }).click();
  await expect(page.getByRole("button", { name: "Devam", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Çalışan seç: Test uzmanı", exact: true }).click();
  await page.getByRole("button", { name: "Devam", exact: true }).click();
  await expect(page.getByLabel("İşletme randevu tarihi")).toBeVisible();
}

async function toReview(page: Page) {
  await toDates(page);
  await expect(page.getByRole("button", { name: "Devam", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: /^\d{2}:\d{2}$/ }).click();
  await page.getByRole("button", { name: "Devam", exact: true }).click();
  await expect(page.getByText("Bilgileri kontrol et", { exact: true })).toBeVisible();
}

test("native manager creates customer booking in verified branch with bearer auth and fixed footer", async ({ page, context }) => {
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  const { writes } = await setup(page); await toReview(page);
  const footer = await page.getByTestId("staff-booking-footer").boundingBox();
  expect(footer).not.toBeNull(); expect(footer!.y + footer!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  await page.getByRole("button", { name: "Randevuyu oluştur", exact: true }).click();
  await expect(page.getByText("Randevu oluşturuldu", { exact: true })).toBeVisible();
  expect(writes).toHaveLength(1); expect(writes[0].authorization).toMatch(/^Bearer /);
  expect(writes[0].url.searchParams.get("businessId")).toBe(business.id);
  expect(writes[0].url.searchParams.get("branchId")).toBe(business.branchId);
  expect(writes[0].body).toMatchObject({ customerId: userId, serviceId: business.services[0].id, employeeId: business.employees[0].id });
  expect(writes[0].body.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/i);
  expect(Object.keys(writes[0].body).sort()).toEqual(["customerId", "employeeId", "idempotencyKey", "serviceId", "startsAt"]);
  await page.screenshot({ path: "artifacts/mobile-staff-booking-success.jpg", type: "jpeg", quality: 95 });
  await page.getByRole("button", { name: "Tamam", exact: true }).click();
  await expect(page.getByText("İşletme adına randevu", { exact: true })).toHaveCount(0);
  expect(context.pages()).toHaveLength(1); expect(errors).toEqual([]);
});

test("uncertain staff booking response preserves exact draft and idempotency key on retry", async ({ page }) => {
  const { writes } = await setup(page, { failure: "retry" }); await toReview(page);
  await page.getByRole("button", { name: "Randevuyu oluştur", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "yanıtı alınamadı" })).toBeVisible();
  await expect(page.getByText("Bilgileri kontrol et", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Randevuyu oluştur", exact: true }).click();
  await expect(page.getByText("Randevu oluşturuldu", { exact: true })).toBeVisible();
  expect(writes).toHaveLength(2); expect(writes[1].body).toEqual(writes[0].body);
});

test("staff booking conflict requires fresh slot choice and fresh idempotency key", async ({ page }) => {
  const { writes } = await setup(page, { failure: "conflict" }); await toReview(page);
  await page.getByRole("button", { name: "Randevuyu oluştur", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Yeni bir saat seç" })).toBeVisible();
  await expect(page.getByLabel("İşletme randevu tarihi")).toBeVisible();
  await expect(page.getByRole("button", { name: "Devam", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: /^\d{2}:\d{2}$/ }).click();
  await page.getByRole("button", { name: "Devam", exact: true }).click();
  await page.getByRole("button", { name: "Randevuyu oluştur", exact: true }).click();
  await expect(page.getByText("Randevu oluşturuldu", { exact: true })).toBeVisible();
  expect(writes).toHaveLength(2); expect(writes[1].body.idempotencyKey).not.toBe(writes[0].body.idempotencyKey);
  expect(writes[1].body.startsAt).not.toBe(writes[0].body.startsAt);
});

test("date changes and invalid dates cannot reuse a previously selected slot", async ({ page }) => {
  const { writes } = await setup(page); await toDates(page);
  await page.getByRole("button", { name: /^\d{2}:\d{2}$/ }).click();
  await page.getByLabel("İşletme randevu tarihi").fill("2026-02-31");
  await page.getByRole("button", { name: "Saatleri getir", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Geçerli tarihi" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Devam", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: /^\d{4}-\d{2}-\d{2}$/ }).nth(1).click();
  await expect(page.getByRole("button", { name: "Devam", exact: true })).toBeDisabled();
  expect(writes).toHaveLength(0);
});

test("empty staff availability has actionable guidance but no bookable draft", async ({ page }) => {
  const { writes } = await setup(page, { empty: true }); await toDates(page);
  await expect(page.getByText("Bu tarihte uygun saat yok. Başka tarih veya çalışan seç.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Devam", exact: true })).toBeDisabled();
  expect(writes).toHaveLength(0);
});

test("private customer lookup failures are visible and recover without abandoning wizard", async ({ page }) => {
  await setup(page, { lookupError: true });
  await page.getByRole("button", { name: "Müşteri adına randevu", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Müşteri seçenekleri yüklenemedi" })).toBeVisible();
  await page.getByRole("button", { name: "Müşteri seçeneklerini yeniden yükle", exact: true }).click();
  await expect(page.getByRole("button", { name: "Müşteri seç: Test Müşteri", exact: true })).toBeVisible();
});

test("staff cannot see the owner/manager on-behalf creation action", async ({ page }) => {
  const { writes } = await setup(page, { employee: true });
  // Native stack navigation retains the hidden customer profile, whose name
  // duplicates the appointment customer. Assert the active section instead.
  await expect(page.getByText("Randevularını takip et ve yönet", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Müşteri adına randevu", exact: true })).toHaveCount(0);
  expect(writes).toHaveLength(0);
});

test("authenticated direct manager deep link hydrates without homepage HTML mismatch", async ({ page }) => {
  await setup(page);
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/manage/appointments");
  await page.getByRole("button", { name: "Müşteri adına randevu", exact: true }).click();
  await expect(page.getByRole("button", { name: "Müşteri seç: Test Müşteri", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Randevu editörünü kapat", exact: true }).click();
  await expect(page.getByText("İşletme adına randevu", { exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("second branch selection scopes subsequent on-behalf lookup and creation", async ({ page }) => {
  const { writes, requests } = await setup(page);
  await page.getByRole("button", { name: "İşletme menüsünü aç", exact: true }).click();
  await page.getByText("İkinci şube", { exact: true }).click();
  await toReview(page); await page.getByRole("button", { name: "Randevuyu oluştur", exact: true }).click();
  await expect(page.getByText("Randevu oluşturuldu", { exact: true })).toBeVisible();
  expect(requests.every((url) => url.searchParams.get("businessId") === business.id && url.searchParams.get("branchId") === appointmentId)).toBe(true);
  expect(writes[0].url.searchParams.get("branchId")).toBe(appointmentId);
});
