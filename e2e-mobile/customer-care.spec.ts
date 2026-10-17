import { expect, test, type Page } from "@playwright/test";
import { customerCareSchema, type CustomerCare, type CustomerCareWrite } from "../lib/customer-care-contract";
import { appointmentId, business, mockApi, session, signIn } from "./fixtures";

test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const endpoint = "/api/business-management/customer-care";
const customerId = "72000000-0000-4000-8000-000000000001";
const rowId = (n: number) => `72000000-0000-4000-8000-${String(n + 100).padStart(12, "0")}`;
const instant = "2026-10-12T12:00:00Z";
const headers = { "Access-Control-Allow-Origin": "http://localhost:8082", "Access-Control-Allow-Headers": "authorization,content-type", "Access-Control-Allow-Methods": "GET,POST,OPTIONS" };
type Options = { employee?: boolean; firstReadFailure?: boolean; firstWriteFailure?: 409 | 503; paginated?: boolean; invalidScope?: boolean; revokedSecondBranch?: boolean };
async function careApi(page: Page, options: Options = {}) {
  const unrelatedWrites = await mockApi(page, { businessAccount: true, employee: options.employee });
  const reads: URL[] = []; const writes: CustomerCareWrite[] = []; const unexpected: string[] = [];
  const contextReads = { count: 0 };
  let profile: CustomerCare["profile"] = { allergies: ["Lateks"], anamnesis: "Kontrollü bakım geçmişi", treatmentNotes: "Kontrollü işlem notu", consentStatus: "missing", consentAt: null, consentVersion: null, updatedAt: instant };
  await page.route(/https:\/\/[^/]*\.supabase\.co\/.*/, async (route) => { unexpected.push(route.request().url()); await route.abort(); });
  await page.route("http://localhost:3001/api/business-management/context**", async (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    contextReads.count += 1;
    const selected = new URL(route.request().url()).searchParams.get("branchId") ?? business.branchId;
    const revoked = options.revokedSecondBranch && selected === appointmentId;
    return route.fulfill({ headers, json: { business, businesses: [{ id: business.id, name: business.name }], branch: { id: selected, name: selected === business.branchId ? "Merkez" : "İkinci şube" }, branches: [{ id: business.branchId, name: "Merkez" }, { id: appointmentId, name: "İkinci şube" }], role: options.employee ? "EMPLOYEE" : "OWNER", permissions: { calendar: true, customers: !revoked, campaigns: !options.employee, inventory: !options.employee, reports: !options.employee, operations: !options.employee }, financialVisibility: !options.employee, customerVisibility: revoked ? "none" : options.employee ? "assigned" : "all", person: "Test Yönetici" } });
  });
  await page.route("http://localhost:3001/api/business-management/customers**", async (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    return route.fulfill({ headers, json: { rows: [{ id: customerId, title: "Kontrollü müşteri", subtitle: "05555555555", phone: "05555555555", notes: "" }], total: 1, hasMore: false } });
  });
  await page.route(`http://localhost:3001${endpoint}**`, async (route) => {
    const req = route.request(); if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    expect(req.headers().authorization).toBe(`Bearer ${session.access_token}`);
    const url = new URL(req.url()); expect(url.searchParams.get("businessId")).toBe(business.id); expect(url.searchParams.get("customerId")).toBe(customerId);
    if (req.method() === "POST") {
      const body = req.postDataJSON() as CustomerCareWrite; writes.push(body);
      if (options.firstWriteFailure && writes.length === 1) return route.fulfill({ status: options.firstWriteFailure, headers, json: { error: options.firstWriteFailure === 409 ? "Bakım kaydı başka bir işlemde değişti. Güncel kaydı yükle." : "Bakım kaydı kaydedilemedi. Yeniden dene." } });
      profile = { ...profile, allergies: body.allergies, anamnesis: body.anamnesis, treatmentNotes: body.treatmentNotes, consentStatus: body.consentStatus, consentVersion: body.consentVersion || null, updatedAt: "2026-10-12T12:01:00Z" };
      return route.fulfill({ headers, json: { saved: true, customerId, updatedAt: profile.updatedAt } });
    }
    reads.push(url); if (options.firstReadFailure && reads.length === 1) return route.fulfill({ status: 503, headers, json: { error: "Müşteri servisi şu anda kullanılamıyor." } });
    const tab = (url.searchParams.get("tab") ?? "appointments") as CustomerCare["page"]["tab"]; const offset = Number(url.searchParams.get("offset") ?? 0);
    const allRows: CustomerCare["page"]["rows"] = tab === "appointments" ? Array.from({ length: options.paginated ? 26 : 1 }, (_, i) => ({ type: "appointment" as const, id: rowId(i), startsAt: instant, endsAt: "2026-10-12T12:30:00Z", status: "completed" as const, employeeName: "Kontrollü uzman", branchName: "Merkez", services: [i === 25 ? "Son bakım hizmeti" : "Kontrollü kesim"], amountMinor: options.employee ? null : "45000", currency: options.employee ? null : "TRY" }))
      : tab === "loyalty" ? [{ type: "loyalty", id: rowId(1), occurredAt: instant, kind: "observed_baseline", delta: 0, balanceBefore: 40, balanceAfter: 40 }]
      : tab === "communications" ? [{ type: "communication", id: rowId(2), channel: "sms", status: "delivered", attempts: 2, createdAt: instant, deliveredAt: instant }]
      : [{ type: "media", id: rowId(3), kind: "before", storagePath: `${business.id}/${customerId}/fixture.jpg`, caption: "Kontrollü özel görsel", createdAt: instant, url: "http://localhost:3001/brand/salonny-mark.png?signed=fixture" }];
    const data: CustomerCare = { scope: { businessId: business.id, branchId: url.searchParams.get("branchId") ?? business.branchId, customerId, employeeId: options.employee ? business.employees[0].id : null, financialVisible: !options.employee, canWrite: !options.employee }, customer: { id: customerId, fullName: "Kontrollü müşteri", phone: "05555555555", email: null, notes: null, marketingConsent: false }, profile, loyalty: options.employee ? null : { points: 40, tier: "standard", updatedAt: instant, recordedSince: instant, pastMovementsKnown: false }, page: { tab, offset, total: allRows.length, hasMore: offset + 25 < allRows.length, rows: allRows.slice(offset, offset + 25) } };
    customerCareSchema.parse(data); if (options.invalidScope) data.scope.customerId = rowId(99);
    return route.fulfill({ headers, json: data });
  });
  return { reads, writes, unrelatedWrites, unexpected, contextReads };
}
async function openCare(page: Page) { await signIn(page); await page.goto("/manage/customers"); await page.getByRole("button", { name: "Müşteri bakım ve geçmişi", exact: true }).click(); await expect(page.getByTestId("customer-care-content")).toBeVisible(); }
function safe(run: Awaited<ReturnType<typeof careApi>>) { expect(run.unrelatedWrites).toEqual([]); expect(run.unexpected).toEqual([]); }

test("native customer card opens without leaving app and shows truthful history", async ({ page }) => {
  const run = await careApi(page); await openCare(page); await expect(page.getByText("Kontrollü bakım geçmişi", { exact: true })).toBeVisible(); await expect(page.getByText("Kontrollü kesim", { exact: true })).toBeVisible(); await expect(page.getByText(/tahsilat değildir/)).toBeVisible(); expect(run.writes).toEqual([]); safe(run);
});
test("staff card is read-only and hides money and loyalty tabs", async ({ page }) => {
  const run = await careApi(page, { employee: true }); await openCare(page); await expect(page.getByText(/Salt okunur/)).toBeVisible(); await expect(page.getByRole("button", { name: "Bakım kaydını düzenle", exact: true })).toHaveCount(0); await expect(page.getByRole("button", { name: "Sadakat hareketleri", exact: true })).toHaveCount(0); await expect(page.getByText(/tahsilat değildir/)).toHaveCount(0); await expect(page.getByText(/Finansal görünürlük kapalı/)).toBeVisible(); expect(run.writes).toEqual([]); safe(run);
});
test("native care editor sends only expected-version care fields", async ({ page }) => {
  const run = await careApi(page); await openCare(page); await page.getByRole("button", { name: "Bakım kaydını düzenle", exact: true }).click(); await page.getByLabel("Anamnez", { exact: true }).fill("Yeni kontrollü anamnez"); await page.getByRole("button", { name: "Talep edildi", exact: true }).click(); await page.getByRole("button", { name: "Bakım kaydını kaydet", exact: true }).click(); await expect(page.getByText("Yeni kontrollü anamnez", { exact: true })).toBeVisible(); expect(run.writes).toHaveLength(1); expect(run.writes[0]).toEqual({ customerId, expectedVersion: instant, allergies: ["Lateks"], anamnesis: "Yeni kontrollü anamnez", treatmentNotes: "Kontrollü işlem notu", consentStatus: "requested", consentVersion: "" }); safe(run);
});
test("care conflict stops overwrite and offers a fresh record", async ({ page }) => {
  const run = await careApi(page, { firstWriteFailure: 409 }); await openCare(page); await page.getByRole("button", { name: "Bakım kaydını düzenle", exact: true }).click(); await page.getByLabel("Anamnez", { exact: true }).fill("Eski taslak"); await page.getByRole("button", { name: "Bakım kaydını kaydet", exact: true }).click(); await expect(page.getByText(/başka bir işlemde değişti/)).toBeVisible(); await expect(page.getByRole("button", { name: "Bakım kaydını kaydet", exact: true })).toHaveCount(0); await page.getByRole("button", { name: "Güncel bakım kaydını yükle", exact: true }).click(); await expect(page.getByText("Kontrollü bakım geçmişi", { exact: true })).toBeVisible(); expect(run.writes).toHaveLength(1); safe(run);
});
test("care editor keeps a failed draft and retries without a new version", async ({ page }) => {
  const run = await careApi(page, { firstWriteFailure: 503 }); await openCare(page); await page.getByRole("button", { name: "Bakım kaydını düzenle", exact: true }).click(); await page.getByLabel("Anamnez", { exact: true }).fill("Tekrar denenecek not"); await page.getByRole("button", { name: "Bakım kaydını kaydet", exact: true }).click(); await expect(page.getByText(/Bakım kaydı kaydedilemedi/)).toBeVisible(); await expect(page.getByLabel("Anamnez", { exact: true })).toHaveValue("Tekrar denenecek not"); await page.getByRole("button", { name: "Bakım kaydını kaydet", exact: true }).click(); await expect(page.getByText("Tekrar denenecek not", { exact: true })).toBeVisible(); expect(run.writes).toHaveLength(2); expect(run.writes[0]).toEqual(run.writes[1]); safe(run);
});
test("care edit discard is explicit and never sends a write", async ({ page }) => {
  const run = await careApi(page); await openCare(page); await page.getByRole("button", { name: "Bakım kaydını düzenle", exact: true }).click(); await page.getByLabel("Anamnez", { exact: true }).fill("Kaydedilmeyen not"); await page.getByRole("button", { name: "Bakım düzenlemesini kapat", exact: true }).click(); await expect(page.getByText(/Kaydedilmemiş bakım değişikliklerin var/)).toBeVisible(); await page.getByRole("button", { name: "Düzenlemeye devam et", exact: true }).click(); await expect(page.getByLabel("Anamnez", { exact: true })).toHaveValue("Kaydedilmeyen not"); await page.getByRole("button", { name: "Bakım düzenlemesini kapat", exact: true }).click(); await page.getByRole("button", { name: "Değişiklikleri bırak", exact: true }).click(); await expect(page.getByText("Kontrollü bakım geçmişi", { exact: true })).toBeVisible(); expect(run.writes).toEqual([]); safe(run);
});
test("native history paginates in exact 25-row pages", async ({ page }) => {
  const run = await careApi(page, { paginated: true }); await openCare(page); await expect(page.locator('[data-testid^="customer-care-row-"]')).toHaveCount(25); await page.getByRole("button", { name: "Sonraki müşteri kayıtları", exact: true }).click(); await expect(page.getByText("Son bakım hizmeti", { exact: true })).toBeVisible(); await expect(page.locator('[data-testid^="customer-care-row-"]')).toHaveCount(1); await page.getByRole("button", { name: "Önceki müşteri kayıtları", exact: true }).click(); await expect(page.locator('[data-testid^="customer-care-row-"]')).toHaveCount(25); expect(run.reads.some((url) => url.searchParams.get("offset") === "25")).toBe(true); expect(run.writes).toEqual([]); safe(run);
});
test("loyalty and communication tabs do not invent history or send messages", async ({ page }) => {
  const run = await careApi(page); await openCare(page); await page.getByRole("button", { name: "Sadakat hareketleri", exact: true }).click(); await expect(page.getByText("Eski bakiye gözlendi; geçmiş hareket değildir", { exact: true })).toBeVisible(); await page.getByRole("button", { name: "İletişim durumu", exact: true }).click(); await expect(page.getByText(/SMS · Teslim edildi/)).toBeVisible(); await expect(page.getByText(/2 deneme/)).toBeVisible(); await expect(page.getByText(/buradan mesaj gönderilmez/)).toBeVisible(); expect(run.writes).toEqual([]); safe(run);
});
test("private gallery is time-limited and stays inside the native card", async ({ page }) => {
  const run = await careApi(page); await openCare(page); await page.getByRole("button", { name: "Bakım görselleri", exact: true }).click(); await expect(page.getByRole("img", { name: "Kontrollü özel görsel" })).toBeVisible(); await expect(page.getByText(/5 dakika geçerlidir/)).toBeVisible(); expect(run.writes).toEqual([]); safe(run);
});
test("read retry and mismatched customer scopes fail closed", async ({ page }) => {
  const run = await careApi(page, { firstReadFailure: true }); await openCare(page); await expect(page.getByText("Müşteri kaydı alınamadı", { exact: true })).toBeVisible(); await page.getByRole("button", { name: "Müşteri kaydını yeniden yükle", exact: true }).click(); await expect(page.getByText("Kontrollü bakım geçmişi", { exact: true })).toBeVisible(); expect(run.writes).toEqual([]); safe(run);
});
test("forged response customer never renders private care text", async ({ page }) => {
  const run = await careApi(page, { invalidScope: true }); await openCare(page); await expect(page.getByText("Müşteri kaydı alınamadı", { exact: true })).toBeVisible(); await expect(page.getByText("Kontrollü bakım geçmişi", { exact: true })).toHaveCount(0); expect(run.writes).toEqual([]); safe(run);
});
test("same-scope focus revalidation keeps draft and its original CAS revision", async ({ page }) => {
  await page.clock.install();
  const run = await careApi(page, { firstWriteFailure: 409 }); await openCare(page);
  await page.getByRole("button", { name: "Bakım kaydını düzenle", exact: true }).click();
  await page.getByLabel("Anamnez", { exact: true }).fill("Odak dönüşünde korunacak taslak");
  const before = run.contextReads.count; const careReads = run.reads.length;
  await page.clock.fastForward(61_001);
  // Simulate foreground/background DOM events in this synthetic test page,
  // without touching app cache or real account/provider state.
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" }); window.dispatchEvent(new Event("visibilitychange"));
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" }); window.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(() => run.contextReads.count).toBeGreaterThan(before);
  await expect(page.getByLabel("Anamnez", { exact: true })).toHaveValue("Odak dönüşünde korunacak taslak");
  expect(run.reads).toHaveLength(careReads);
  await page.getByRole("button", { name: "Bakım kaydını kaydet", exact: true }).click();
  await expect(page.getByText(/başka bir işlemde değişti/)).toBeVisible(); expect(run.writes[0].expectedVersion).toBe(instant); safe(run);
});
