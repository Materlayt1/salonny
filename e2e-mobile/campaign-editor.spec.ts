import { expect, test, type Page } from "@playwright/test";
import { business, mockApi, signIn } from "./fixtures";
import type { CampaignMutation, ManagedCampaign } from "../lib/campaign-management-contract";

test.use({ deviceScaleFactor: 1, viewport: { width: 390, height: 844 } });
const campaignId = "10000000-0000-4000-8000-000000000002";
const secondBusiness = "85000000-0000-4000-8000-000000000001";
const secondBranch = "85000000-0000-4000-8000-000000000002";
const headers = { "Access-Control-Allow-Origin": "http://localhost:8082", "Access-Control-Allow-Headers": "authorization,content-type", "Access-Control-Allow-Methods": "GET,POST,OPTIONS" };
type Write = { body: CampaignMutation; url: string; authorization?: string };
async function setup(page: Page, options: { used?: boolean; legacy?: boolean; failOnce?: boolean; stale?: boolean; employee?: boolean; second?: boolean; paginated?: boolean; malformed?: boolean } = {}) {
  await mockApi(page, { businessAccount: true, employee: options.employee });
  await page.route("**/*.supabase.co/**", (route) => new URL(route.request().url()).hostname === "fixture.supabase.co" ? route.fallback() : route.abort());
  const writes: Write[] = []; let attempts = 0;
  const rows: ManagedCampaign[] = Array.from({ length: options.paginated ? 27 : 1 }, (_, index) => ({
    id: index ? `85000000-0000-4000-8000-${String(100 + index).padStart(12, "0")}` : campaignId,
    businessId: business.id, name: index ? `Fırsat ${index}` : "Test kampanyası", status: "active", revision: 3,
    terms: options.legacy ? null : { code: index ? `TEST${index}` : "TEST20", kind: "percentage", value: 20, audience: "all", startsAt: null, endsAt: null },
    termsEditable: !options.used && !options.legacy, lockReason: options.legacy ? "legacy" : options.used ? "used" : null,
  }));
  if (options.second) await page.route("**/api/business-management/context**", async (route) => {
    const selected = new URL(route.request().url()).searchParams.get("businessId") === secondBusiness;
    await route.fulfill({ json: { business: selected ? { ...business, id: secondBusiness, name: "İkinci işletme" } : business, businesses: [{ id: business.id, name: business.name }, { id: secondBusiness, name: "İkinci işletme" }], branch: { id: selected ? secondBranch : business.branchId, name: "Merkez" }, branches: [{ id: selected ? secondBranch : business.branchId, name: "Merkez" }], role: "OWNER", permissions: { campaigns: true, calendar: true, customers: true, operations: true, inventory: true, reports: true }, customerVisibility: "all", financialVisibility: true, person: "Test Yönetici" }, headers });
  });
  await page.route("**/api/business-management/campaign-editor?**", async (route) => {
    const req = route.request(); const url = new URL(req.url());
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    const selectedBusiness = url.searchParams.get("businessId")!;
    if (req.method() === "GET") {
      const q = (url.searchParams.get("q") ?? "").toLowerCase(); const offset = Number(url.searchParams.get("offset") ?? 0);
      const selected = rows.filter((row) => row.name.toLowerCase().includes(q)).map((row) => ({ ...row, businessId: options.malformed ? secondBusiness : selectedBusiness, ...(selectedBusiness === secondBusiness ? { name: "İkinci işletme kampanyası" } : {}) }));
      return route.fulfill({ json: { businessId: selectedBusiness, rows: selected.slice(offset, offset + 25), total: selected.length, offset, hasMore: offset + 25 < selected.length }, headers });
    }
    const body = req.postDataJSON() as CampaignMutation;
    writes.push({ body, url: req.url(), authorization: req.headers().authorization });
    if (options.failOnce && attempts++ === 0) return route.fulfill({ status: 503, json: { error: "Kampanya kaydedilemedi. Yeniden dene." }, headers });
    if (options.stale) return route.fulfill({ status: 409, json: { error: "Kampanya başka bir işlemle değişti. Listeyi yenileyip yeniden düzenle.", code: "CAMPAIGN_STALE" }, headers });
    let saved = rows.find((row) => row.id === body.id);
    if (!saved) { saved = { ...rows[0], id: "85000000-0000-4000-8000-000000000099", businessId: selectedBusiness, name: body.name, revision: 0, termsEditable: true, lockReason: null }; rows.unshift(saved); }
    saved.name = body.name; saved.businessId = selectedBusiness; saved.revision = body.id ? body.revision! + 1 : 0;
    saved.status = body.status === "active" && body.action === "save" && body.terms.startsAt && Date.parse(body.terms.startsAt) > Date.now() ? "scheduled" : body.status;
    if (body.action === "save") saved.terms = body.terms;
    return route.fulfill({ json: saved, status: body.id ? 200 : 201, headers });
  });
  await signIn(page); await page.goto("/manage/campaigns"); return writes;
}
async function input(page: Page, label: string, value: string) {
  const field = page.getByLabel(label, { exact: true });
  await field.scrollIntoViewIfNeeded();
  await field.click();
  await expect(field).toBeFocused();
  await field.press("ControlOrMeta+A");
  await field.press("Backspace");
  await field.pressSequentially(value);
  await expect(field).toHaveValue(value);
}
async function createFields(page: Page) { await page.getByRole("button", { name: "Yeni kampanya", exact: true }).click(); await input(page, "Kampanya adı", "Sonbahar fırsatı"); await input(page, "Kampanya kodu", "sonbahar20"); await input(page, "Kampanya indirim değeri", "20"); }

test("native campaign validates fields, exact dates and scoped atomic create with UUID", async ({ page, context }) => {
  const writes = await setup(page); await page.getByRole("button", { name: "Yeni kampanya", exact: true }).click();
  await page.getByRole("button", { name: "Kampanyayı oluştur", exact: true }).click(); await expect(page.getByText("Kampanya adı 2–140 karakter olmalı.", { exact: true })).toBeVisible(); expect(writes).toHaveLength(0);
  await input(page, "Kampanya adı", "Sonbahar fırsatı"); await input(page, "Kampanya kodu", "sonbahar20"); await input(page, "Kampanya indirim değeri", "120");
  await page.getByRole("button", { name: "Kampanyayı oluştur", exact: true }).click(); await expect(page.getByText("Yüzde 1–100 arasında tam sayı olmalı.", { exact: true })).toBeVisible(); expect(writes).toHaveLength(0);
  await input(page, "Kampanya indirim değeri", "20"); await input(page, "Kampanya başlangıcı", "2026-10-15 09:00"); await input(page, "Kampanya bitişi", "2026-10-14 18:00");
  await page.getByRole("button", { name: "Kampanyayı oluştur", exact: true }).click(); await expect(page.getByText("Bitiş başlangıçtan sonra olmalı.", { exact: true })).toBeVisible(); expect(writes).toHaveLength(0);
  await input(page, "Kampanya bitişi", "2026-10-31 18:00"); await page.getByRole("button", { name: "Kampanyayı oluştur", exact: true }).click();
  await expect(page.getByRole("button", { name: "Kampanya ekranını kapat", exact: true })).toHaveCount(0); await expect(page.getByText("Sonbahar fırsatı", { exact: true })).toBeVisible();
  expect(writes[0].body).toEqual({ action: "save", id: null, revision: null, requestId: expect.stringMatching(/^[0-9a-f-]{36}$/), name: "Sonbahar fırsatı", status: "active", terms: { code: "SONBAHAR20", kind: "percentage", value: 20, audience: "all", startsAt: "2026-10-15T06:00:00.000Z", endsAt: "2026-10-31T15:00:00.000Z" } });
  expect(writes[0].authorization).toMatch(/^Bearer /); expect(new URL(writes[0].url).searchParams.get("businessId")).toBe(business.id); expect(new URL(writes[0].url).searchParams.get("branchId")).toBe(business.branchId); expect(context.pages()).toHaveLength(1);
});
test("unused campaign edits all conditions with revision CAS", async ({ page }) => {
  const writes = await setup(page); await page.getByRole("button", { name: "Test kampanyası kampanyasını düzenle", exact: true }).click();
  await input(page, "Kampanya kodu", "NEW30"); await input(page, "Kampanya indirim değeri", "30"); await page.getByRole("button", { name: "Yeni müşteriler", exact: true }).click();
  await page.getByRole("button", { name: "Kampanya bilgilerini kaydet", exact: true }).click();
  await expect(page.getByRole("button", { name: "Kampanya ekranını kapat", exact: true })).toHaveCount(0);
  expect(writes[0].body).toMatchObject({ action: "save", id: campaignId, revision: 3, terms: { code: "NEW30", value: 30, audience: "new" } });
});
test("used coupon freezes segment and terms but allows name/status CAS", async ({ page }) => {
  const writes = await setup(page, { used: true }); await page.getByRole("button", { name: "Test kampanyası kampanyasını düzenle", exact: true }).click();
  await expect(page.getByText("İndirim koşulları korunuyor", { exact: true })).toBeVisible(); await expect(page.getByLabel("Kampanya kodu", { exact: true })).toHaveCount(0); await expect(page.getByRole("button", { name: "Yeni müşteriler", exact: true })).toHaveCount(0);
  await input(page, "Kampanya adı", "Yeni isim"); await page.getByRole("button", { name: "Taslak / duraklatıldı", exact: true }).click(); await page.getByRole("button", { name: "Kampanya bilgilerini kaydet", exact: true }).click();
  await expect(page.getByText("Yeni isim", { exact: true })).toBeVisible(); expect(writes[0].body).toEqual({ action: "metadata", id: campaignId, revision: 3, requestId: expect.any(String), name: "Yeni isim", status: "draft" });
});
test("exact fixed decimal uses service currency, safe retry keeps same operation UUID", async ({ page }) => {
  const writes = await setup(page, { failOnce: true }); await createFields(page); await page.getByRole("button", { name: "Sabit tutar indirimi", exact: true }).click(); await input(page, "Kampanya indirim değeri", "100,50");
  await expect(page.getByText(/Sabit tutar seçilen hizmetin para biriminde uygulanır/)).toBeVisible();
  await page.getByRole("button", { name: "Kampanyayı oluştur", exact: true }).click(); await expect(page.getByText("Kampanya kaydedilemedi. Yeniden dene.", { exact: true })).toBeVisible(); await expect(page.getByLabel("Kampanya adı", { exact: true })).toHaveValue("Sonbahar fırsatı");
  await page.getByRole("button", { name: "Kampanyayı oluştur", exact: true }).click(); await expect(page.getByRole("button", { name: "Kampanya ekranını kapat", exact: true })).toHaveCount(0);
  expect(writes).toHaveLength(2); expect(writes[0].body).toEqual(writes[1].body); expect(writes[0].body).toMatchObject({ terms: { kind: "fixed", value: 10050 } });
});
test("stale edit preserves fields without reporting success", async ({ page }) => {
  const writes = await setup(page, { stale: true }); await page.getByRole("button", { name: "Test kampanyası kampanyasını düzenle", exact: true }).click(); await input(page, "Kampanya adı", "Kaydedilmemiş isim"); await page.getByRole("button", { name: "Kampanya bilgilerini kaydet", exact: true }).click();
  await expect(page.getByText("Kampanya başka bir işlemle değişti. Listeyi yenileyip yeniden düzenle.", { exact: true })).toBeVisible(); await expect(page.getByLabel("Kampanya adı", { exact: true })).toHaveValue("Kaydedilmemiş isim"); expect(writes).toHaveLength(1);
});
test("legacy campaign only allows name and status without inventing terms", async ({ page }) => {
  const writes = await setup(page, { legacy: true }); await page.getByRole("button", { name: "Test kampanyası kampanyasını düzenle", exact: true }).click(); await expect(page.getByText(/Eski kampanyanın tekil\/geçerli kupon bağlantısı yok/)).toBeVisible(); await expect(page.getByLabel("Kampanya kodu", { exact: true })).toHaveCount(0); await input(page, "Kampanya adı", "Eski kampanya yeni adı"); await page.getByRole("button", { name: "Kampanya bilgilerini kaydet", exact: true }).click(); await expect(page.getByRole("button", { name: "Kampanya ekranını kapat", exact: true })).toHaveCount(0); expect(writes[0].body.action).toBe("metadata");
});
test("selected second business can create without wrong-tenant fallback", async ({ page }) => {
  const writes = await setup(page, { second: true });
  await page.getByRole("button", { name: "İşletme menüsünü aç", exact: true }).click();
  await page.getByRole("button", { name: "İkinci işletme", exact: true }).click();
  // Changing business must preserve the current native section; rebuilding
  // Slot must not reset its router to the overview or show the old tenant.
  await expect(page).toHaveURL(/\/manage\/campaigns$/);
  await expect(page.getByText("İkinci işletme kampanyası", { exact: true })).toBeVisible();
  await createFields(page); await page.getByRole("button", { name: "Kampanyayı oluştur", exact: true }).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(new URL(writes[0].url).searchParams.get("businessId")).toBe(secondBusiness);
  expect(new URL(writes[0].url).searchParams.get("branchId")).toBe(secondBranch);
});
test("25 row page and filtering avoid unbounded lists", async ({ page }) => {
  await setup(page, { paginated: true }); await expect(page.getByText("27 kampanya · 25 gösteriliyor", { exact: true })).toBeVisible(); await page.getByRole("button", { name: "Daha fazla kampanya", exact: true }).click(); await expect(page.getByText("27 kampanya · 27 gösteriliyor", { exact: true })).toBeVisible(); await input(page, "Kampanya ara", "Fırsat 26"); await page.getByRole("button", { name: "Kampanyalarda ara", exact: true }).click(); await expect(page.getByText("1 kampanya · 1 gösteriliyor", { exact: true })).toBeVisible();
});
test("malformed tenant response is not disclosed and employees cannot write", async ({ page }) => {
  const writes = await setup(page, { malformed: true }); await expect(page.getByText("Kampanya verisi doğrulanamadı. Listeyi yenile.", { exact: true })).toBeVisible(); await expect(page.getByText("Test kampanyası", { exact: true })).toHaveCount(0); expect(writes).toHaveLength(0);
});
test("employee screen denies campaign controls", async ({ page }) => {
  const writes = await setup(page, { employee: true }); await expect(page.getByRole("button", { name: "Yeni kampanya", exact: true })).toHaveCount(0); await expect(page.getByText("Bu bölüm mevcut değil veya erişim yetkin bulunmuyor.", { exact: true })).toBeVisible(); expect(writes).toHaveLength(0);
});
