import { expect, test, type Page } from "@playwright/test";
import { business, mockApi, signIn } from "./fixtures";

test.use({ deviceScaleFactor: 1, viewport: { width: 390, height: 844 } });

const packageId = "20000000-0000-4000-8000-000000000001";
const customerId = "20000000-0000-4000-8000-000000000002";
const grantId = "20000000-0000-4000-8000-000000000003";
const template = { id: packageId, name: "5 seans bakım", serviceId: business.services[0].id, serviceName: "Saç kesimi", sessionCount: 5, validityDays: 365, active: true };

async function packageApi(page: Page, options: { failure?: boolean; paginated?: boolean; readFailure?: boolean } = {}) {
  const writes: Array<{ body: Record<string, unknown>; url: string; authorization?: string }> = [];
  const reads: URL[] = [];
  let templates = [{ ...template }];
  let grants = [{ id: grantId, customerId, customerName: "Test Paket Müşterisi", packageId, packageName: template.name, remainingSessions: 3, expiresAt: "2020-01-01T00:00:00Z", expired: true, usedSessions: null }];
  let attempts = 0;
  await page.route("http://localhost:3001/api/business-management/packages**", async (route) => {
    const req = route.request(); const url = new URL(req.url());
    const headers = { "Access-Control-Allow-Origin": "http://localhost:8082", "Access-Control-Allow-Headers": "authorization,content-type", "Access-Control-Allow-Methods": "GET,POST,OPTIONS" };
    const respond = (data: unknown, status = 200) => route.fulfill({ status, json: data, headers });
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    if (req.method() !== "GET") {
      const body = req.postDataJSON(); writes.push({ body, url: req.url(), authorization: req.headers().authorization });
      if (options.failure && attempts++ === 0) return respond({ error: "Paket kaydedilemedi. Yeniden dene." }, 503);
      if (body.action === "create") templates = [{ ...template, ...body }, ...templates];
      if (body.action === "update") templates = templates.map((row) => row.id === body.id ? { ...row, name: body.name, validityDays: body.validityDays, active: body.active } : row);
      if (body.action === "assign") grants = [{ ...grants[0], id: body.id, expiresAt: "2099-01-01T00:00:00Z", expired: false, remainingSessions: 5 }, ...grants];
      return respond({ saved: true, id: body.id });
    }
    reads.push(url);
    if (options.readFailure && reads.length === 1) return respond({ error: "Paket listesi alınamadı." }, 503);
    const mode = url.searchParams.get("mode"); const offset = Number(url.searchParams.get("offset") ?? "0");
    if (mode === "customers" || mode === "services") return respond({ rows: mode === "customers" ? [{ id: customerId, name: "Test Paket Müşterisi" }] : [{ id: business.services[0].id, name: "Saç kesimi" }], hasMore: false });
    if (mode === "assignments") return respond({ rows: grants, hasMore: false, usageNote: "Başlangıç bakiyesi saklanmadığı için kullanılan seans sayısı tahmin edilmez." });
    if (options.paginated && !offset) return respond({ rows: Array.from({ length: 25 }, (_, i) => ({ ...template, id: `page-first-${i}`, name: `İlk sayfa paketi ${i + 1}` })), hasMore: true });
    if (options.paginated) return respond({ rows: [{ ...template, name: "İkinci sayfa paketi" }], hasMore: false });
    return respond({ rows: templates, hasMore: false });
  });
  return { writes, reads };
}

async function openPackages(page: Page) {
  await signIn(page); await page.goto("/manage/operations");
  await page.getByRole("button", { name: "Paketler ve seanslar", exact: true }).click();
}

test("native packages show recorded balance and expiry without inventing used sessions", async ({ page, context }) => {
  await mockApi(page, { businessAccount: true }); const { reads } = await packageApi(page); await openPackages(page);
  await expect(page.getByText(template.name, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Müşteri seansları", exact: true }).click();
  await expect(page.getByText("3 seans kaldı", { exact: true })).toBeVisible();
  await expect(page.getByText("Süresi doldu · randevuda kullanılamaz")).toBeVisible();
  await expect(page.getByText(/kullanılan seans sayısı tahmin edilmez/)).toBeVisible();
  expect(reads.every((url) => url.searchParams.get("businessId") === business.id && url.searchParams.get("branchId") === business.branchId)).toBe(true);
  expect(context.pages()).toHaveLength(1);
  await page.screenshot({ path: "artifacts/mobile-native-package-balances.jpg", type: "jpeg", quality: 95 });
});

test("package creation validates inputs and sends selected service without any payment fields", async ({ page }) => {
  await mockApi(page, { businessAccount: true }); const { writes } = await packageApi(page); await openPackages(page);
  await page.getByRole("button", { name: "Yeni seans paketi", exact: true }).click();
  await page.getByLabel("Paket seans sayısı", { exact: true }).fill("0");
  await page.getByRole("button", { name: "Paketi oluştur", exact: true }).click();
  await expect(page.getByText("Paket adı 2–120 karakter olmalı.")).toBeVisible();
  await expect(page.getByText("Seans sayısı 1–1000 arasında tam sayı olmalı.")).toBeVisible(); expect(writes).toHaveLength(0);
  await page.getByLabel("Paket adı", { exact: true }).fill("10 seans saç bakımı");
  await page.getByLabel("Paket seans sayısı", { exact: true }).fill("10");
  await page.getByLabel("Paket geçerlilik günü", { exact: true }).fill("90");
  await page.getByRole("button", { name: "Belirli hizmet seç", exact: true }).click();
  await page.getByRole("button", { name: "Hizmet seç: Saç kesimi", exact: true }).click();
  await page.getByRole("button", { name: "Paketi oluştur", exact: true }).click();
  await expect(page.getByText("Paket kaydedildi.", { exact: true })).toBeVisible();
  expect(writes).toHaveLength(1);
  expect(writes[0].body).toMatchObject({ action: "create", name: "10 seans saç bakımı", sessionCount: 10, validityDays: 90, serviceId: business.services[0].id, active: true });
  expect(Object.keys(writes[0].body).sort()).toEqual(["action", "active", "id", "name", "serviceId", "sessionCount", "validityDays"]);
  expect(writes[0].authorization).toMatch(/^Bearer /);
});

test("metadata editor preserves entitlement and already assigned session quantities", async ({ page }) => {
  await mockApi(page, { businessAccount: true }); const { writes } = await packageApi(page); await openPackages(page);
  await page.getByRole("button", { name: "Paket bilgilerini düzenle", exact: true }).click();
  await expect(page.getByLabel("Paket seans sayısı", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Belirli hizmet seç", exact: true })).toHaveCount(0);
  await page.getByLabel("Paket adı", { exact: true }).fill("Bakım paketi");
  await page.getByLabel("Paket geçerlilik günü", { exact: true }).fill("120");
  await page.getByLabel("Paket aktif", { exact: true }).click();
  await page.getByRole("button", { name: "Paket bilgilerini kaydet", exact: true }).click();
  await expect(page.getByText("Paket kaydedildi.", { exact: true })).toBeVisible();
  expect(writes[0].body).toEqual({ action: "update", id: packageId, name: "Bakım paketi", validityDays: 120, active: false });
  await expect(page.getByRole("button", { name: "Müşteriye tanımla", exact: true })).toBeDisabled();
});

test("grant confirmation can cancel and successful grant uses a scoped customer without setting balance", async ({ page }) => {
  await mockApi(page, { businessAccount: true }); const { writes } = await packageApi(page); await openPackages(page);
  await page.getByRole("button", { name: "Müşteriye tanımla", exact: true }).click();
  await expect(page.getByRole("button", { name: "Müşteriye paketi tanımla", exact: true })).toBeDisabled();
  await page.getByLabel("Paket için müşteri ara", { exact: true }).fill("Test");
  await page.getByRole("button", { name: "Müşteri seç: Test Paket Müşterisi", exact: true }).click();
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Müşteriye paketi tanımla", exact: true }).click(); expect(writes).toHaveLength(0);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Müşteriye paketi tanımla", exact: true }).click();
  await expect(page.getByText("Paket müşteriye tanımlandı.", { exact: true })).toBeVisible();
  expect(writes).toHaveLength(1); expect(writes[0].body).toMatchObject({ action: "assign", packageId, customerId });
  expect(Object.keys(writes[0].body).sort()).toEqual(["action", "customerId", "id", "packageId"]);
  expect(new URL(writes[0].url).searchParams.get("businessId")).toBe(business.id);
  await page.getByRole("button", { name: "Müşteri seansları", exact: true }).click();
  await expect(page.getByText("5 seans kaldı", { exact: true })).toBeVisible();
});

test("unknown write failure preserves form and reuses one id on retry", async ({ page }) => {
  await mockApi(page, { businessAccount: true }); const { writes } = await packageApi(page, { failure: true }); await openPackages(page);
  await page.getByRole("button", { name: "Yeni seans paketi", exact: true }).click();
  await page.getByLabel("Paket adı", { exact: true }).fill("Tek işlem paketi");
  await page.getByRole("button", { name: "Paketi oluştur", exact: true }).click();
  await expect(page.getByText("Paket kaydedilemedi. Yeniden dene.", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Paket adı", { exact: true })).toHaveValue("Tek işlem paketi");
  await page.getByRole("button", { name: "Paketi oluştur", exact: true }).click();
  await expect(page.getByText("Paket kaydedildi.", { exact: true })).toBeVisible();
  expect(writes).toHaveLength(2); expect(writes[0].body).toEqual(writes[1].body);
});

test("package list retries failed reads and paginates only when requested", async ({ page }) => {
  await mockApi(page, { businessAccount: true }); const { reads } = await packageApi(page, { paginated: true, readFailure: true }); await openPackages(page);
  await expect(page.getByText("Paket listesi alınamadı.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Paketleri yeniden yükle", exact: true }).click();
  await expect(page.getByText("İlk sayfa paketi 1", { exact: true })).toBeVisible();
  expect(reads.some((url) => url.searchParams.get("offset") === "25")).toBe(false);
  await page.getByRole("button", { name: "Daha fazla paket kaydı", exact: true }).click();
  await expect(page.getByText("İkinci sayfa paketi", { exact: true })).toBeVisible();
  expect(reads.some((url) => url.searchParams.get("offset") === "25")).toBe(true);
  await expect(page.getByRole("button", { name: "Daha fazla paket kaydı", exact: true })).toHaveCount(0);
});

test("unsaved package edits stay until abandonment is explicitly confirmed", async ({ page }) => {
  await mockApi(page, { businessAccount: true }); const { writes } = await packageApi(page); await openPackages(page);
  await page.getByRole("button", { name: "Yeni seans paketi", exact: true }).click();
  await page.getByLabel("Paket adı", { exact: true }).fill("Kaydedilmemiş paket");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Paket listesine dön", exact: true }).click();
  await expect(page.getByLabel("Paket adı", { exact: true })).toHaveValue("Kaydedilmemiş paket");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Paket listesine dön", exact: true }).click();
  await expect(page.getByLabel("Paket adı", { exact: true })).toHaveCount(0); expect(writes).toHaveLength(0);
});

test("ordinary employees cannot open package management", async ({ page }) => {
  await mockApi(page, { businessAccount: true, employee: true }); await signIn(page); await page.goto("/manage/operations");
  await expect(page.getByRole("button", { name: "Paketler ve seanslar", exact: true })).toHaveCount(0);
});
