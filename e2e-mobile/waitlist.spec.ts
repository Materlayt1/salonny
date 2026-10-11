import { expect, test, type Page } from "@playwright/test";
import { appointmentId, business, mockApi, signIn, userId } from "./fixtures";

test.use({ deviceScaleFactor: 1, viewport: { width: 390, height: 844 } });

const id = "40000000-0000-4000-8000-000000000001";
const createdId = "40000000-0000-4000-8000-000000000002";
const futureDay = new Date(Date.now() + 3 * 86_400_000);
futureDay.setUTCHours(9, 0, 0, 0);
const windowFrom = futureDay.toISOString();
const windowTo = new Date(Date.parse(windowFrom) + 86_400_000).toISOString();
const slot = new Date(Date.parse(windowFrom) + 3_600_000).toISOString();
const updatedAt = "2026-10-01T09:00:00.000Z";
const freshUpdatedAt = "2026-10-02T09:00:00.000Z";

function local(instant: string) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(instant));
  const get = (name: string) => parts.find((part) => part.type === name)!.value;
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}
const entry = {
  id, customerId: userId, customerName: "Bekleyen müşteri", customerPhone: "05555555555", serviceId: business.services[0].id, serviceName: "Saç kesimi",
  employeeId: null as string | null, employeeName: null as string | null, desiredFrom: windowFrom, desiredTo: windowTo,
  priority: 100, notes: "İlk kayıt notu", status: "waiting", updatedAt, offeredStartsAt: null as string | null, offerExpiresAt: null as string | null, partySize: 1, offerExpired: false,
};
type Options = { failure?: "createRetry" | "offerRetry" | "updateConflict" | "offerConflict"; readFailure?: boolean; paginated?: boolean; emptySlots?: boolean; group?: boolean; preferred?: boolean; employee?: boolean; ended?: boolean };

async function setup(page: Page, options: Options = {}) {
  const api = await mockApi(page, { businessAccount: true, employee: options.employee });
  const reads: URL[] = []; const lookups: URL[] = [];
  const writes: Array<{ body: Record<string, unknown>; url: URL; authorization?: string }> = [];
  let rows = [{ ...entry, desiredFrom: options.ended ? "2020-01-01T09:00:00Z" : windowFrom, desiredTo: options.ended ? "2020-01-02T09:00:00Z" : windowTo, partySize: options.group ? 3 : 1, employeeId: options.preferred ? business.employees[0].id : null, employeeName: options.preferred ? "Test uzmanı" : null }];
  let readFailed = false; let writeFailed = false;
  const headers = { "Access-Control-Allow-Origin": "http://localhost:8082", "Access-Control-Allow-Headers": "authorization,content-type", "Access-Control-Allow-Methods": "GET,POST,OPTIONS" };
  await page.route("http://localhost:3001/api/business-management/booking-editor?**", async (route) => {
    const request = route.request(); const url = new URL(request.url());
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    lookups.push(url);
    const kind = url.searchParams.get("kind");
    const choices = kind === "customers" ? [{ id: userId, title: "Bekleyen müşteri", subtitle: "05555555555" }] : kind === "services" ? [{ id: business.services[0].id, title: "Saç kesimi" }] : [{ id: business.employees[0].id, title: "Test uzmanı" }];
    return route.fulfill({ json: { rows: choices, hasMore: false }, headers });
  });
  await page.route("http://localhost:3001/api/business-management/waitlist?**", async (route) => {
    const request = route.request(); const url = new URL(request.url());
    const reply = (data: unknown, status = 200) => route.fulfill({ status, json: data, headers });
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    if (request.method() === "POST") {
      const body = request.postDataJSON(); writes.push({ body, url, authorization: request.headers().authorization });
      if (!writeFailed && ((options.failure === "createRetry" && body.action === "create") || (options.failure === "offerRetry" && body.action === "prepareOffer"))) {
        writeFailed = true;
        return reply({ error: "Bekleme işleminin yanıtı alınamadı. Yeniden dene." }, 503);
      }
      if (!writeFailed && ((options.failure === "updateConflict" && body.action === "update") || (options.failure === "offerConflict" && body.action === "prepareOffer"))) {
        writeFailed = true; rows[0] = { ...rows[0], updatedAt: freshUpdatedAt, notes: "Sunucuda değişen kayıt" };
        return reply({ error: "Kayıt başka bir işlemde değişti. Güncel kaydı yükle." }, 409);
      }
      if (body.action === "create") rows = [{ ...entry, ...body, id: createdId, customerName: "Yeni bekleyen müşteri", updatedAt: freshUpdatedAt }, ...rows];
      if (body.action === "update") rows = rows.map((row) => row.id === body.id ? { ...row, ...body, updatedAt: freshUpdatedAt } : row);
      if (body.action === "cancel") rows = rows.map((row) => row.id === body.id ? { ...row, status: "cancelled", updatedAt: freshUpdatedAt } : row);
      if (body.action === "prepareOffer") rows = rows.map((row) => row.id === body.id ? { ...row, status: "offered", offeredStartsAt: body.startsAt, offerExpiresAt: new Date(Date.now() + Number(body.offerMinutes) * 60_000).toISOString(), updatedAt: freshUpdatedAt } : row);
      return reply({ saved: true, id: body.action === "create" ? createdId : body.id, status: body.action === "cancel" ? "cancelled" : body.action === "prepareOffer" ? "offered" : "waiting", updatedAt: freshUpdatedAt, notificationSent: false, appointmentCreated: false }, body.action === "create" ? 201 : 200);
    }
    reads.push(url);
    const mode = url.searchParams.get("mode");
    if (mode === "entry") return reply({ entry: rows.find((row) => row.id === url.searchParams.get("entryId")), timezone: "Europe/Istanbul" });
    if (mode === "slots") return reply({ slots: options.emptySlots ? [] : [slot], timezone: "Europe/Istanbul" });
    if (options.readFailure && !readFailed) { readFailed = true; return reply({ error: "Bekleme listesi alınamadı." }, 503); }
    const offset = Number(url.searchParams.get("offset") ?? 0);
    if (options.paginated && !offset) return reply({ rows: Array.from({ length: 25 }, (_, i) => ({ ...entry, id: `first-${i}`, customerName: `İlk sayfa müşterisi ${i + 1}` })), hasMore: true, timezone: "Europe/Istanbul" });
    if (options.paginated) return reply({ rows: [{ ...entry, customerName: "İkinci sayfa müşterisi" }], hasMore: false, timezone: "Europe/Istanbul" });
    const q = url.searchParams.get("q") ?? ""; const status = url.searchParams.get("status") ?? "active";
    const filtered = rows.filter((row) => (status === "all" || status === "active" ? status === "all" || ["waiting", "offered"].includes(row.status) : row.status === status) && row.customerName.toLocaleLowerCase("tr-TR").includes(q.toLocaleLowerCase("tr-TR")));
    return reply({ rows: filtered, hasMore: false, timezone: "Europe/Istanbul" });
  });
  await signIn(page); await page.goto("/manage/operations");
  if (!options.employee) await page.getByRole("button", { name: "Bekleme listesi yönetimi", exact: true }).click();
  return { reads, lookups, writes, apiWrites: api };
}

async function newEntry(page: Page) {
  await page.getByRole("button", { name: "Yeni bekleme kaydı", exact: true }).click();
  await page.getByRole("button", { name: "Bekleme müşteri seç: Bekleyen müşteri", exact: true }).click();
  await page.getByRole("button", { name: "Bekleme hizmet seç: Saç kesimi", exact: true }).click();
  await page.getByLabel("İstenen başlangıç", { exact: true }).fill(local(windowFrom));
  await page.getByLabel("İstenen bitiş", { exact: true }).fill(local(windowTo));
}
async function offer(page: Page, preferred = false) {
  await page.getByRole("button", { name: "Bekleme teklifi hazırla: Bekleyen müşteri", exact: true }).click();
  if (!preferred) await page.getByRole("button", { name: "Bekleme çalışan seç: Test uzmanı", exact: true }).click();
  await page.getByRole("button", { name: /^\d{2}:\d{2}$/ }).click();
}

test("native waitlist is scoped and explains that offers neither reserve nor notify", async ({ page, context }) => {
  await page.setViewportSize({ width: 320, height: 740 }); const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  const { reads } = await setup(page);
  await expect(page.getByText("Bekleyen müşteri", { exact: true })).toBeVisible();
  await expect(page.getByText("Bekleme kaydı randevu değildir. Teklif hazırlama müşteriye otomatik bildirim göndermez ve saati ayırmaz.")).toBeVisible();
  expect(reads.every((url) => url.searchParams.get("businessId") === business.id && url.searchParams.get("branchId") === business.branchId)).toBe(true);
  const close = await page.getByRole("button", { name: "Bekleme listesini kapat", exact: true }).boundingBox();
  expect(close!.x + close!.width).toBeLessThanOrEqual(320); expect(context.pages()).toHaveLength(1); expect(errors).toEqual([]);
  await page.screenshot({ path: "artifacts/mobile-native-waitlist-320.jpg", type: "jpeg", quality: 95 });
});

test("create validates strict future dates and sends scoped existing customer/service without booking fields", async ({ page }) => {
  const { writes, lookups } = await setup(page); await newEntry(page);
  await page.getByLabel("İstenen başlangıç", { exact: true }).fill("2026-02-31 10:00");
  await page.getByLabel("Bekleme önceliği", { exact: true }).fill("1001");
  await page.getByRole("button", { name: "Bekleme kaydını ekle", exact: true }).click();
  await expect(page.getByText(/Önümüzdeki 180 gün içindeki başlangıcı/)).toBeVisible(); expect(writes).toHaveLength(0);
  await page.getByLabel("İstenen başlangıç", { exact: true }).fill(local(windowFrom));
  await page.getByLabel("Bekleme önceliği", { exact: true }).fill("5");
  await page.getByLabel("Bekleme notu", { exact: true }).fill("Öğleden sonra tercih eder");
  await page.getByRole("button", { name: "Bekleme kaydını ekle", exact: true }).click();
  await expect(page.getByText("Bekleme kaydı kaydedildi.", { exact: true })).toBeVisible();
  expect(writes).toHaveLength(1); expect(writes[0].authorization).toMatch(/^Bearer /);
  expect(writes[0].body).toMatchObject({ action: "create", customerId: userId, serviceId: business.services[0].id, employeeId: null, priority: 5, notes: "Öğleden sonra tercih eder" });
  expect(Object.keys(writes[0].body).sort()).toEqual(["action", "customerId", "desiredFrom", "desiredTo", "employeeId", "idempotencyKey", "notes", "priority", "serviceId"]);
  expect(lookups.every((url) => url.searchParams.get("businessId") === business.id && url.searchParams.get("branchId") === business.branchId)).toBe(true);
});

test("uncertain creation keeps exact draft and idempotency key for manual retry", async ({ page }) => {
  const { writes } = await setup(page, { failure: "createRetry" }); await newEntry(page);
  await page.getByLabel("Bekleme notu", { exact: true }).fill("Kaybolmayan taslak");
  await page.getByRole("button", { name: "Bekleme kaydını ekle", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "yanıtı alınamadı" })).toBeVisible();
  await expect(page.getByLabel("Bekleme notu", { exact: true })).toHaveValue("Kaybolmayan taslak");
  await page.getByRole("button", { name: "Bekleme kaydını ekle", exact: true }).click();
  await expect(page.getByText("Bekleme kaydı kaydedildi.", { exact: true })).toBeVisible();
  expect(writes).toHaveLength(2); expect(writes[1].body).toEqual(writes[0].body);
});

test("stale update preserves draft and requires scoped reload before saving a new version", async ({ page }) => {
  const { writes } = await setup(page, { failure: "updateConflict" });
  await page.getByRole("button", { name: "Bekleme kaydını düzenle: Bekleyen müşteri", exact: true }).click();
  await expect(page.getByRole("button", { name: "Bekleme müşterisini seç", exact: true })).toHaveCount(0);
  await page.getByLabel("Bekleme notu", { exact: true }).fill("Benim korunacak notum");
  await page.getByRole("button", { name: "Bekleme kaydını güncelle", exact: true }).click();
  await expect(page.getByRole("button", { name: "Güncel bekleme kaydını yükle", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Bekleme kaydını güncelle", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Güncel bekleme kaydını yükle", exact: true }).click();
  await expect(page.getByLabel("Bekleme notu", { exact: true })).toHaveValue("Benim korunacak notum");
  await page.getByRole("button", { name: "Bekleme kaydını güncelle", exact: true }).click();
  await expect(page.getByText("Bekleme kaydı kaydedildi.", { exact: true })).toBeVisible();
  expect(writes[0].body.expectedUpdatedAt).toBe(updatedAt); expect(writes[1].body.expectedUpdatedAt).toBe(freshUpdatedAt);
  expect(writes[1].body.idempotencyKey).not.toBe(writes[0].body.idempotencyKey); expect(writes[1].body.notes).toBe("Benim korunacak notum");
});

test("soft cancellation needs explicit confirmation and retains cancelled history", async ({ page }) => {
  const { writes } = await setup(page);
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Bekleme kaydını iptal et: Bekleyen müşteri", exact: true }).click(); expect(writes).toHaveLength(0);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Bekleme kaydını iptal et: Bekleyen müşteri", exact: true }).click();
  await expect(page.getByText("Bekleme kaydı iptal edildi; geçmişi korundu.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "İptal edildi", exact: true }).click();
  await expect(page.getByText("Bekleyen müşteri", { exact: true })).toBeVisible();
  expect(writes[0].body).toMatchObject({ action: "cancel", id, expectedUpdatedAt: updatedAt });
});

test("offer enforces explicit employee and expiry range without appointment or messaging writes", async ({ page }) => {
  const { writes, apiWrites } = await setup(page); await offer(page);
  await page.getByLabel("Teklif geçerlilik süresi", { exact: true }).fill("4");
  await page.getByRole("button", { name: "Teklifi hazırla", exact: true }).click();
  await expect(page.getByText("Teklif süresi 5–120 dakika olmalı.", { exact: true })).toBeVisible(); expect(writes).toHaveLength(0);
  await page.getByLabel("Teklif geçerlilik süresi", { exact: true }).fill("30");
  await page.getByRole("button", { name: "Teklifi hazırla", exact: true }).click();
  await expect(page.getByText("Teklif hazırlandı. Bildirim gönderilmedi ve randevu oluşturulmadı. Müşteriyle ayrıca iletişime geç.", { exact: true })).toBeVisible();
  expect(writes[0].body).toMatchObject({ action: "prepareOffer", id, employeeId: business.employees[0].id, startsAt: slot, offerMinutes: 30, expectedUpdatedAt: updatedAt });
  expect(apiWrites.some((write) => /bookings|appointments|notifications|queue|communication/.test(write.path))).toBe(false);
});

test("offer date edits hide old-day slots and conflict reload requires explicit fresh slot selection", async ({ page }) => {
  const { writes } = await setup(page, { failure: "offerConflict" }); await offer(page);
  await page.getByLabel("Teklif için tarih", { exact: true }).fill("2026-02-31");
  await expect(page.getByRole("button", { name: /^\d{2}:\d{2}$/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Teklifi hazırla", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Teklif saatlerini getir", exact: true }).click();
  await expect(page.getByText("Geçerli tarihi YIL-AY-GÜN biçiminde gir.", { exact: true })).toBeVisible();
  await page.getByLabel("Teklif için tarih", { exact: true }).fill(local(windowFrom).slice(0, 10));
  await page.getByRole("button", { name: "Teklif saatlerini getir", exact: true }).click();
  await page.getByRole("button", { name: /^\d{2}:\d{2}$/ }).click();
  await page.getByRole("button", { name: "Teklifi hazırla", exact: true }).click();
  await expect(page.getByRole("button", { name: "Teklifi hazırla", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Güncel bekleme kaydını yükle", exact: true }).click();
  await expect(page.getByRole("button", { name: "Teklifi hazırla", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: /^\d{2}:\d{2}$/ }).click();
  await page.getByRole("button", { name: "Teklifi hazırla", exact: true }).click();
  await expect(page.getByText(/Teklif hazırlandı\. Bildirim gönderilmedi/)).toBeVisible();
  expect(writes).toHaveLength(2); expect(writes[1].body.startsAt).toBe(writes[0].body.startsAt);
  expect(writes[1].body.expectedUpdatedAt).toBe(freshUpdatedAt); expect(writes[1].body.idempotencyKey).not.toBe(writes[0].body.idempotencyKey);
});

test("uncertain offer response retains same payload and preferred employee on retry", async ({ page }) => {
  const { writes } = await setup(page, { failure: "offerRetry", preferred: true }); await offer(page, true);
  await expect(page.getByRole("button", { name: "Teklif çalışanını seç", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Teklifi hazırla", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "yanıtı alınamadı" })).toBeVisible();
  await page.getByRole("button", { name: "Teklifi hazırla", exact: true }).click();
  await expect(page.getByText(/Teklif hazırlandı\. Bildirim gönderilmedi/)).toBeVisible();
  expect(writes).toHaveLength(2); expect(writes[1].body).toEqual(writes[0].body);
});

test("read recovery and manual pagination use bounded 25-row pages", async ({ page }) => {
  const { reads } = await setup(page, { readFailure: true, paginated: true });
  await expect(page.getByText("Bekleme listesi alınamadı.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Bekleme listesini yeniden yükle", exact: true }).click();
  await expect(page.getByText("İlk sayfa müşterisi 1", { exact: true })).toBeVisible();
  expect(reads.some((url) => url.searchParams.get("offset") === "25")).toBe(false);
  await page.getByRole("button", { name: "Daha fazla bekleme kaydı", exact: true }).click();
  await expect(page.getByText("İkinci sayfa müşterisi", { exact: true })).toBeVisible();
  expect(reads.some((url) => url.searchParams.get("offset") === "25")).toBe(true);
});

test("search empty state and empty availability cannot prepare a stale offer", async ({ page }) => {
  const { reads, writes } = await setup(page, { emptySlots: true });
  await page.getByLabel("Bekleme listesinde müşteri ara", { exact: true }).fill("Olmayan müşteri");
  await expect(page.getByText("Aramana uygun bekleme kaydı yok.", { exact: true })).toBeVisible();
  expect(reads.some((url) => url.searchParams.get("q") === "Olmayan müşteri")).toBe(true);
  await page.getByLabel("Bekleme listesinde müşteri ara", { exact: true }).fill("");
  await page.getByRole("button", { name: "Bekleme teklifi hazırla: Bekleyen müşteri", exact: true }).click();
  await page.getByRole("button", { name: "Bekleme çalışan seç: Test uzmanı", exact: true }).click();
  await expect(page.getByText("Bu tarihte tercih aralığına uyan uygun saat yok. Başka tarih veya çalışan seç.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Teklifi hazırla", exact: true })).toBeDisabled(); expect(writes).toHaveLength(0);
});

test("legacy group records allow only cancellation and unsaved new drafts require abandonment confirmation", async ({ page }) => {
  const { writes } = await setup(page, { group: true });
  await expect(page.getByText("Eski grup kaydı (3 kişi): bu ekranda düzenleme veya teklif hazırlama desteklenmez.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Bekleme kaydını düzenle: Bekleyen müşteri", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Bekleme teklifi hazırla: Bekleyen müşteri", exact: true })).toHaveCount(0);
  await newEntry(page); await page.getByLabel("Bekleme notu", { exact: true }).fill("Sakla");
  page.once("dialog", (dialog) => dialog.dismiss()); await page.getByRole("button", { name: "Bekleme listesine dön", exact: true }).click();
  await expect(page.getByLabel("Bekleme notu", { exact: true })).toHaveValue("Sakla");
  page.once("dialog", (dialog) => dialog.accept()); await page.getByRole("button", { name: "Bekleme listesine dön", exact: true }).click();
  await expect(page.getByLabel("Bekleme notu", { exact: true })).toHaveCount(0); expect(writes).toHaveLength(0);
});

test("ordinary employee cannot open advanced waitlist", async ({ page }) => {
  await setup(page, { employee: true });
  await expect(page.getByRole("button", { name: "Bekleme listesi yönetimi", exact: true })).toHaveCount(0);
});

test("ended request windows remain visible but block offers until edited", async ({ page }) => {
  const { writes } = await setup(page, { ended: true });
  await expect(page.getByText("Talep tarih aralığı sona erdi. Yeni teklif için kaydı düzenleyip tarih aralığını yenile.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Bekleme teklifi hazırla: Bekleyen müşteri", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Bekleme kaydını düzenle: Bekleyen müşteri", exact: true }).click();
  await page.getByLabel("İstenen başlangıç", { exact: true }).fill(local(windowFrom));
  await page.getByLabel("İstenen bitiş", { exact: true }).fill(local(windowTo));
  await page.getByRole("button", { name: "Bekleme kaydını güncelle", exact: true }).click();
  await expect(page.getByRole("button", { name: "Bekleme teklifi hazırla: Bekleyen müşteri", exact: true })).toBeEnabled();
  expect(writes).toHaveLength(1); expect(writes[0].body.action).toBe("update");
});

test("second branch selection scopes waitlist list and choices without previous modal state", async ({ page }) => {
  const { reads, lookups } = await setup(page);
  await page.getByRole("button", { name: "Bekleme listesini kapat", exact: true }).click();
  await page.getByRole("button", { name: "İşletme menüsünü aç", exact: true }).click();
  await page.getByText("İkinci şube", { exact: true }).click();
  await page.getByRole("button", { name: "Bekleme listesi yönetimi", exact: true }).click();
  await newEntry(page);
  expect(reads.at(-1)!.searchParams.get("branchId")).toBe(appointmentId);
  expect(lookups.every((url) => url.searchParams.get("branchId") === appointmentId)).toBe(true);
});
