import { expect, test, type Page } from "@playwright/test";
import { business, mockApi, signIn } from "./fixtures";

test.use({ deviceScaleFactor: 1, viewport: { width: 390, height: 844 } });
const grantId = "60000000-0000-4000-8000-000000000001";
const customerId = "60000000-0000-4000-8000-000000000002";
const packageId = "60000000-0000-4000-8000-000000000003";
const appointmentId = "60000000-0000-4000-8000-000000000004";
const customerName = "Seans Test Müşterisi";
const endpoint = "http://localhost:3001/api/business-management/packages**";
function history(origin: "grant" | "legacy_baseline" | "unrecorded" = "grant", offset = 0, paginated = false) {
  const total = origin === "unrecorded" ? 0 : paginated ? 27 : 3;
  const rows = Array.from({ length: total }, (_, index) => ({ id: `60000000-0000-4000-9000-${String(index + 1).padStart(12, "0")}`, kind: index === total - 1 ? origin === "grant" ? "grant" : "baseline" : "consume", sessionsDelta: index === total - 1 ? origin === "grant" ? total + 2 : 0 : -1, balanceAfter: 3 + index, appointmentId: index === total - 1 ? null : appointmentId, serviceName: index === total - 1 ? null : "Bakım", occurredAt: "2026-10-12T09:00:00Z" }));
  return { grant: { id: grantId, customerId, packageId, packageName: "Tanımlandığı andaki 5 seans bakım", remainingSessions: 3, expiresAt: "2027-10-12T09:00:00Z", initialSessions: origin === "grant" ? total + 2 : null, validityDays: origin === "grant" ? 365 : null, origin, recordedAt: origin === "unrecorded" ? null : "2026-10-10T09:00:00Z", serviceId: null, priceMinor: null, currency: null, usedSessions: origin === "grant" ? total - 1 : null, recordedUsedSessions: Math.max(0, total - 1) }, offset, total, hasMore: offset + 25 < total, rows: rows.slice(offset, offset + 25) };
}
async function openLedger(page: Page, options: { origin?: "grant" | "legacy_baseline" | "unrecorded"; paginated?: boolean; failure?: boolean; malformed?: boolean; employee?: boolean } = {}) {
  const writes = await mockApi(page, { businessAccount: true, employee: options.employee });
  const reads: Array<{ url: URL; authorization?: string }> = []; const unexpected: string[] = []; let attempts = 0;
  await page.route(/https:\/\/[^/]*\.supabase\.co\/.*/, async (route) => { unexpected.push(route.request().url()); await route.abort(); });
  await page.route(endpoint, async (route) => {
    const request = route.request(); const url = new URL(request.url());
    const headers = { "Access-Control-Allow-Origin": "http://localhost:8082", "Access-Control-Allow-Headers": "authorization,content-type", "Access-Control-Allow-Methods": "GET,POST,OPTIONS" };
    const reply = (json: unknown, status = 200) => route.fulfill({ status, json, headers });
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    if (request.method() !== "GET") { unexpected.push(`${request.method()} ${url}`); return reply({ error: "Writes are forbidden in this read-only fixture" }, 500); }
    reads.push({ url, authorization: request.headers().authorization });
    if (url.searchParams.get("mode") === "templates") return reply({ rows: [], hasMore: false });
    if (url.searchParams.get("mode") === "assignments") return reply({ rows: [{ id: grantId, customerId, customerName, packageId, packageName: "Bugünkü şablon adı", remainingSessions: 3, expiresAt: "2027-10-12T09:00:00Z", expired: false, usedSessions: null }], hasMore: false });
    if (url.searchParams.get("mode") === "ledger") {
      if (options.failure && attempts++ === 0) return reply({ error: "Seans geçmişi altyapısı henüz etkin değil." }, 503);
      const data = history(options.origin, Number(url.searchParams.get("offset") ?? 0), options.paginated);
      if (options.malformed) data.grant.id = customerId;
      return reply(data);
    }
    return reply({ error: "Unknown fixture mode" }, 500);
  });
  await signIn(page); await page.goto("/manage/operations");
  if (!options.employee) {
    await page.getByRole("button", { name: "Paketler ve seanslar", exact: true }).click();
    await page.getByRole("button", { name: "Müşteri seansları", exact: true }).click();
    await page.getByRole("button", { name: `Seans geçmişi: ${customerName}`, exact: true }).click();
  }
  return { writes, reads, unexpected };
}
function safe(fixture: Awaited<ReturnType<typeof openLedger>>) {
  expect(fixture.writes).toHaveLength(0); expect(fixture.unexpected).toHaveLength(0);
  expect(fixture.reads.every(({ url, authorization }) => url.searchParams.get("businessId") === business.id && url.searchParams.get("branchId") === business.branchId && /^Bearer /.test(authorization ?? ""))).toBe(true);
}

test("native ledger shows immutable original grant, known usage and no invented payment", async ({ page, context }) => {
  const fixture = await openLedger(page);
  await expect(page.getByText("Tanımlandığı andaki 5 seans bakım", { exact: true })).toBeVisible();
  await expect(page.getByText("Başlangıç: 5 seans · Kullanılan: 2 seans", { exact: true })).toBeVisible();
  await expect(page.getByText("Bugünkü şablon adı", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/Paket fiyatı veya tahsilat kaydı tutulmamış/)).toBeVisible();
  await expect(page.getByText("Tamamlanan randevuda seans kullanıldı", { exact: true })).toHaveCount(2);
  expect(context.pages()).toHaveLength(1); safe(fixture);
  await page.screenshot({ path: "artifacts/mobile-native-package-ledger.jpg", type: "jpeg", quality: 90 });
});
test("legacy baseline discloses unknown lifetime usage and only new recorded movements", async ({ page }) => {
  const fixture = await openLedger(page, { origin: "legacy_baseline" });
  await expect(page.getByText("Geçmiş toplam kullanım bilinmiyor", { exact: true })).toBeVisible();
  await expect(page.getByText("Yeni kayıt sistemiyle izlenen kullanım: 2 seans", { exact: true })).toBeVisible();
  await expect(page.getByText("Eski bakiye kaydı başlatıldı", { exact: true })).toBeVisible();
  await expect(page.getByText(/Başlangıç: .*Kullanılan:/)).toHaveCount(0); safe(fixture);
});
test("unrecorded old grant never claims empty history proves zero past use", async ({ page }) => {
  const fixture = await openLedger(page, { origin: "unrecorded" });
  await expect(page.getByText("Geçmiş toplam kullanım bilinmiyor", { exact: true })).toBeVisible();
  await expect(page.getByText("Bu paket için henüz izlenebilir seans hareketi yok.", { exact: true })).toBeVisible(); safe(fixture);
});
test("native history paginates 25 movement pages on demand without showing stale page", async ({ page }) => {
  const fixture = await openLedger(page, { paginated: true });
  await expect(page.getByText("Seans hareketleri · 27 kayıt", { exact: true })).toBeVisible();
  expect(fixture.reads.some(({ url }) => url.searchParams.get("offset") === "25")).toBe(false);
  await page.getByRole("button", { name: "Sonraki seans hareketleri", exact: true }).click();
  await expect(page.getByText("Paket tanımlandı", { exact: true })).toBeVisible();
  await expect(page.getByText("Tamamlanan randevuda seans kullanıldı", { exact: true })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Sonraki seans hareketleri", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Önceki seans hareketleri", exact: true }).click();
  await expect(page.getByText("Tamamlanan randevuda seans kullanıldı", { exact: true })).toHaveCount(25); safe(fixture);
});
test("503 history infrastructure error gives retry without false zero movements", async ({ page }) => {
  const fixture = await openLedger(page, { failure: true });
  await expect(page.getByText("Seans geçmişi altyapısı henüz etkin değil.", { exact: true })).toBeVisible();
  await expect(page.getByText(/Seans hareketleri ·/)).toHaveCount(0);
  await page.getByRole("button", { name: "Seans geçmişini yeniden yükle", exact: true }).click();
  await expect(page.getByText("Seans hareketleri · 3 kayıt", { exact: true })).toBeVisible(); safe(fixture);
});
test("mismatched ledger is rejected before any private grant data is shown", async ({ page }) => {
  const fixture = await openLedger(page, { malformed: true });
  await expect(page.getByText("Seans geçmişi doğrulanamadı. Yeniden yükleyerek tekrar dene.", { exact: true })).toBeVisible();
  await expect(page.getByText("Tanımlandığı andaki 5 seans bakım", { exact: true })).toHaveCount(0); safe(fixture);
});
test("ordinary employee cannot open or request package ledger", async ({ page }) => {
  const fixture = await openLedger(page, { employee: true });
  await expect(page.getByRole("button", { name: "Paketler ve seanslar", exact: true })).toHaveCount(0);
  expect(fixture.reads).toHaveLength(0); safe(fixture);
});
