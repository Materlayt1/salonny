import { expect, test, type Page } from "@playwright/test";
import { business, mockApi, signIn } from "./fixtures";

test.use({ deviceScaleFactor: 1, viewport: { width: 390, height: 844 } });
const resourceId = "30000000-0000-4000-8000-000000000001"; const serviceId = business.services[0].id;
const resource = { id: resourceId, name: "Bakım odası", kind: "room", capacity: 2, active: true };
async function resourceApi(page: Page, options: { readFailure?: boolean; writeFailure?: boolean; blocked?: boolean; inactive?: boolean; paginated?: boolean } = {}) {
  const writes: Array<{ body: Record<string, unknown>; url: string; authorization?: string }> = []; const reads: URL[] = []; let failures = 0;
  let resources = [{ ...resource, active: !options.inactive }]; let services = [{ id: serviceId, name: "Saç kesimi", assigned: true, quantity: 1, active: true }, { id: "30000000-0000-4000-8000-000000000002", name: "Saç bakımı", assigned: false, quantity: 1, active: true }];
  await page.route("http://localhost:3001/api/business-management/resources**", async (route) => {
    const req = route.request(); const url = new URL(req.url()); const headers = { "Access-Control-Allow-Origin": "http://localhost:8082", "Access-Control-Allow-Headers": "authorization,content-type", "Access-Control-Allow-Methods": "GET,POST,OPTIONS" };
    const respond = (data: unknown, status = 200) => route.fulfill({ status, json: data, headers });
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    if (req.method() !== "GET") {
      const body = req.postDataJSON(); writes.push({ body, url: req.url(), authorization: req.headers().authorization });
      if (options.writeFailure && failures++ === 0) return respond({ error: "Kaynak kaydedilemedi. Yeniden dene." }, 503);
      if (options.blocked && body.action === "update") return respond({ error: "Devam eden veya gelecek rezervasyonlar varken kapasite azaltılamaz ve kaynak pasife alınamaz." }, 409);
      if (body.action === "create") resources = [{ ...resource, ...body }, ...resources];
      if (body.action === "update") resources = resources.map((row) => row.id === body.id ? { ...row, name: body.name, capacity: body.capacity, active: body.active } : row);
      if (body.action === "link") services = services.map((row) => row.id === body.serviceId ? { ...row, assigned: body.assigned, quantity: body.quantity } : row);
      return respond({ saved: true, id: body.id });
    }
    reads.push(url); const mode = url.searchParams.get("mode"); const offset = Number(url.searchParams.get("offset") ?? 0);
    if (options.readFailure && reads.length === 1) return respond({ error: "Şube kaynakları alınamadı." }, 503);
    if (mode === "services") return respond({ rows: services, hasMore: false });
    if (mode === "usage") return respond({ rows: [{ id: "one-unit", appointmentId: "30000000-0000-4000-8000-000000000007", startsAt: url.searchParams.get("from"), endsAt: new Date(Date.parse(url.searchParams.get("from")!) + 1_800_000).toISOString() }], hasMore: false, summary: { peakUnits: 2, reservationCount: 52, appointmentCount: 26 }, timezone: "Europe/Istanbul" });
    if (options.paginated && !offset) return respond({ rows: Array.from({ length: 25 }, (_, i) => ({ ...resource, id: `first-page-${i}`, name: `Kaynak ${i + 1}` })), hasMore: true });
    if (options.paginated) return respond({ rows: [{ ...resource, name: "İkinci sayfa kaynağı" }], hasMore: false });
    return respond({ rows: resources, hasMore: false });
  });
  return { writes, reads };
}
async function openResources(page: Page) {
  await signIn(page); await page.goto("/manage/operations"); await page.getByRole("button", { name: "Kaynak yönetimi", exact: true }).click();
}

test("native resource creation validates capacity and sends one scoped stable-id payload", async ({ page, context }) => {
  await mockApi(page, { businessAccount: true }); const { writes, reads } = await resourceApi(page); await openResources(page);
  await expect(page.getByText(resource.name, { exact: true })).toBeVisible(); await page.getByRole("button", { name: "Yeni şube kaynağı", exact: true }).click();
  await page.getByLabel("Eşzamanlı kapasite", { exact: true }).fill("0"); await page.getByRole("button", { name: "Kaynağı oluştur", exact: true }).click();
  await expect(page.getByText("Kaynak adı 2–120 karakter olmalı.")).toBeVisible(); await expect(page.getByText("Kapasite 1–100 arasında tam sayı olmalı.")).toBeVisible(); expect(writes).toHaveLength(0);
  await page.getByLabel("Kaynak adı", { exact: true }).fill("Lazer cihazı"); await page.getByLabel("Eşzamanlı kapasite", { exact: true }).fill("3"); await page.getByRole("button", { name: "Cihaz", exact: true }).click();
  await page.getByRole("button", { name: "Kaynağı oluştur", exact: true }).click(); await expect(page.getByText("Kaynak kaydedildi.", { exact: true })).toBeVisible();
  expect(writes).toHaveLength(1); expect(writes[0].body).toMatchObject({ action: "create", name: "Lazer cihazı", kind: "device", capacity: 3, active: true });
  expect(writes[0].body.id).toMatch(/^[0-9a-f-]{36}$/); expect(writes[0].authorization).toMatch(/^Bearer /);
  expect(reads.every((url) => url.searchParams.get("businessId") === business.id && url.searchParams.get("branchId") === business.branchId)).toBe(true); expect(context.pages()).toHaveLength(1);
});

test("single-edge requirement update validates capacity and preserves other services", async ({ page }) => {
  await mockApi(page, { businessAccount: true }); const { writes } = await resourceApi(page); await openResources(page);
  await page.getByRole("button", { name: `Hizmet ihtiyaçları: ${resource.name}`, exact: true }).click();
  await page.getByRole("button", { name: "İhtiyacı düzenle: Saç kesimi", exact: true }).click();
  await page.getByLabel("Randevu başına gereken birim", { exact: true }).fill("3"); await page.getByRole("button", { name: "Hizmet ihtiyacını kaydet", exact: true }).click();
  await expect(page.getByText("Gereken birim 1–2 arasında tam sayı olmalı.")).toBeVisible(); expect(writes).toHaveLength(0);
  await page.getByLabel("Randevu başına gereken birim", { exact: true }).fill("2"); await page.getByRole("button", { name: "Hizmet ihtiyacını kaydet", exact: true }).click();
  await expect(page.getByText("Hizmet ihtiyacı kaydedildi.", { exact: true })).toBeVisible(); await expect(page.getByText("Her randevu için 2 birim gerekli", { exact: true })).toBeVisible();
  expect(writes[0].body).toEqual({ action: "link", id: resourceId, serviceId, assigned: true, quantity: 2 });
  await expect(page.getByRole("button", { name: "İhtiyacı düzenle: Saç bakımı", exact: true })).toBeVisible();
});

test("inactive required resources warn and can be unlinked without deleting any other edge", async ({ page }) => {
  await mockApi(page, { businessAccount: true }); const { writes } = await resourceApi(page, { inactive: true }); await openResources(page);
  await expect(page.getByText("Bağlı hizmetler yeni randevu alamaz.", { exact: true })).toBeVisible(); await page.getByRole("button", { name: `Hizmet ihtiyaçları: ${resource.name}`, exact: true }).click();
  await page.getByRole("button", { name: "İhtiyacı düzenle: Saç kesimi", exact: true }).click(); await page.getByLabel("Hizmet bu kaynağı gerektiriyor", { exact: true }).click();
  await page.getByRole("button", { name: "Hizmet ihtiyacını kaydet", exact: true }).click(); await expect(page.getByText("Hizmet ihtiyacı kaydedildi.", { exact: true })).toBeVisible();
  expect(writes[0].body).toEqual({ action: "link", id: resourceId, serviceId, assigned: false, quantity: 1 });
});

test("capacity reduction conflict preserves metadata form and does not offer destructive deletion", async ({ page }) => {
  await mockApi(page, { businessAccount: true }); const { writes } = await resourceApi(page, { blocked: true }); await openResources(page);
  await page.getByRole("button", { name: `Kaynağı düzenle: ${resource.name}`, exact: true }).click(); await page.getByLabel("Eşzamanlı kapasite", { exact: true }).fill("1");
  await page.getByRole("button", { name: "Kaynak bilgilerini kaydet", exact: true }).click();
  await expect(page.getByText("Devam eden veya gelecek rezervasyonlar varken kapasite azaltılamaz ve kaynak pasife alınamaz.", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Eşzamanlı kapasite", { exact: true })).toHaveValue("1"); expect(writes[0].body).toEqual({ action: "update", id: resourceId, name: resource.name, capacity: 1, active: true });
  await expect(page.getByRole("button", { name: /sil|taşı/i })).toHaveCount(0);
});

test("unknown resource write failure keeps values and retries the same id without automatic writes", async ({ page }) => {
  await mockApi(page, { businessAccount: true }); const { writes } = await resourceApi(page, { writeFailure: true }); await openResources(page);
  await page.getByRole("button", { name: "Yeni şube kaynağı", exact: true }).click(); await page.getByLabel("Kaynak adı", { exact: true }).fill("Yeni koltuk"); await page.getByRole("button", { name: "Kaynağı oluştur", exact: true }).click();
  await expect(page.getByText("Kaynak kaydedilemedi. Yeniden dene.", { exact: true })).toBeVisible(); expect(writes).toHaveLength(1); await expect(page.getByLabel("Kaynak adı", { exact: true })).toHaveValue("Yeni koltuk");
  await page.getByRole("button", { name: "Kaynağı oluştur", exact: true }).click(); await expect(page.getByText("Kaynak kaydedildi.", { exact: true })).toBeVisible(); expect(writes).toHaveLength(2); expect(writes[0].body).toEqual(writes[1].body);
});

test("usage shows all-span peak summary rather than counts from the loaded unit row", async ({ page }) => {
  await mockApi(page, { businessAccount: true }); const { reads, writes } = await resourceApi(page); await openResources(page);
  await page.getByRole("button", { name: `Kapasite kullanımı: ${resource.name}`, exact: true }).click();
  await expect(page.getByText("En yoğun anda 2 / 2 birim", { exact: true })).toBeVisible(); await expect(page.getByText("26 ayrı randevu · 52 rezervasyon birimi", { exact: true })).toBeVisible();
  await expect(page.getByText(/yalnızca yüklenen satırları değil/)).toBeVisible(); await page.getByRole("button", { name: "30 gün", exact: true }).click();
  await expect.poll(() => reads.filter((url) => url.searchParams.get("mode") === "usage").length).toBe(2);
  const usage = reads.filter((url) => url.searchParams.get("mode") === "usage"); expect(usage.every((url) => url.searchParams.get("resourceId") === resourceId)).toBe(true);
  expect(Date.parse(usage[1].searchParams.get("to")!) - Date.parse(usage[1].searchParams.get("from")!)).toBe(30 * 86_400_000); expect(writes).toHaveLength(0);
  await page.screenshot({ path: "artifacts/mobile-native-resource-usage.jpg", type: "jpeg", quality: 95 });
});

test("resource list retries read errors and loads further pages only on request", async ({ page }) => {
  await mockApi(page, { businessAccount: true }); const { reads } = await resourceApi(page, { readFailure: true, paginated: true }); await openResources(page);
  await expect(page.getByText("Şube kaynakları alınamadı.", { exact: true })).toBeVisible(); await expect(page.getByRole("button", { name: "Yeni şube kaynağı", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Şube kaynaklarını yeniden yükle", exact: true }).click(); await expect(page.getByText("Kaynak 1", { exact: true })).toBeVisible();
  expect(reads.some((url) => url.searchParams.get("offset") === "25")).toBe(false); await page.getByRole("button", { name: "Daha fazla şube kaynağı", exact: true }).click();
  await expect(page.getByText("İkinci sayfa kaynağı", { exact: true })).toBeVisible(); expect(reads.some((url) => url.searchParams.get("offset") === "25")).toBe(true);
});

test("unsaved resource edits require explicit abandonment", async ({ page }) => {
  await mockApi(page, { businessAccount: true }); const { writes } = await resourceApi(page); await openResources(page);
  await page.getByRole("button", { name: "Yeni şube kaynağı", exact: true }).click(); await page.getByLabel("Kaynak adı", { exact: true }).fill("Kaydedilmemiş kaynak");
  page.once("dialog", (dialog) => dialog.dismiss()); await page.getByRole("button", { name: "Kaynak listesine dön", exact: true }).click(); await expect(page.getByLabel("Kaynak adı", { exact: true })).toHaveValue("Kaydedilmemiş kaynak");
  page.once("dialog", (dialog) => dialog.accept()); await page.getByRole("button", { name: "Kaynak listesine dön", exact: true }).click(); await expect(page.getByLabel("Kaynak adı", { exact: true })).toHaveCount(0); expect(writes).toHaveLength(0);
});

test("ordinary employees cannot open advanced resource management", async ({ page }) => {
  await mockApi(page, { businessAccount: true, employee: true }); await signIn(page); await page.goto("/manage/operations"); await expect(page.getByRole("button", { name: "Kaynak yönetimi", exact: true })).toHaveCount(0);
});
