import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";
import { mockApi, signIn } from "./fixtures";

// This suite intercepts every write. It creates no real business, customer,
// image, review request, appointment, payment or outbound communication.
test.use({ deviceScaleFactor: 1, viewport: { width: 390, height: 844 } });
const businessId = "a1000000-0000-4000-8000-000000000003";
const branchId = "b1000000-0000-4000-8000-000000000004";
const categoryId = "c1000000-0000-4000-8000-000000000005";
const locationId = "d1000000-0000-4000-8000-000000000006";
const imageId = (n: number) => `e1000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const revision = "2026-10-12T09:00:00.000Z";
const scope = `businessId=${businessId}&branchId=${branchId}`;
const endpoint = "http://localhost:3001/api/business-setup**";
const profile = { name: "Native kurulum salonu", description: "Kontrollü kurulum", phone: "05555555555", whatsappPhone: "", email: "", websiteUrl: "", categoryId };
const location = { id: locationId, addressLine: "Test Caddesi No: 5", district: "Bornova", city: "İzmir", postalCode: "35000", latitude: 38.4, longitude: 27.2 };
function state(role: "OWNER" | "MANAGER" = "OWNER", offset = 0, imageCount = 2) {
  const images = Array.from({ length: imageCount }, (_, index) => ({ id: imageId(index + 1), url: "http://localhost:3001/brand/salonny-mark.png", kind: index === 0 ? "cover" : "gallery", altText: `Kontrollü işletme görseli ${index + 1}`, contentHash: null }));
  return { business: { id: businessId, branchId, branchName: "Merkez", slug: "native-kurulum", role, status: "draft", revision, profile: { ...profile } }, location: { ...location }, timezone: "Europe/Istanbul", categories: [{ id: categoryId, name: "Kuaför" }], images: images.slice(offset, offset + 25), imageOffset: offset, totalImages: images.length, hasMoreImages: offset + 25 < images.length, coverIds: [imageId(1)], readiness: { openDays: 7, activeServices: 1, activeEmployees: 1, settingsPresent: true } };
}
async function setup(page: Page, options: { fresh?: boolean; manager?: boolean; imageCount?: number; readFailure?: boolean; writeFailure?: number; wrongScope?: boolean; uppercase?: boolean; noLocation?: boolean; rejectStaleProfile?: boolean } = {}) {
  const otherWrites = await mockApi(page, { businessAccount: !options.fresh });
  const writes: Array<{ body: Record<string, unknown>; url: URL; authorization?: string }> = [];
  const reads: URL[] = []; const readAuthorizations: string[] = []; const panelReads: URL[] = []; const unexpected: string[] = []; let failures = options.writeFailure ?? 0; let readAttempts = 0; let fresh = options.fresh ?? false;
  const uploaded: Array<{ id: string; url: string; kind: string; altText: string; contentHash: string | null }> = [];
  let current = state(options.manager ? "MANAGER" : "OWNER", 0, options.imageCount);
  await page.route(/https:\/\/[^/]*\.supabase\.co\/.*/, async (route) => { unexpected.push(route.request().url()); await route.abort(); });
  await page.route("http://localhost:3001/api/business-management/context**", async (route) => {
    const req = route.request(); const headers = { "Access-Control-Allow-Origin": "http://localhost:8082", "Access-Control-Allow-Headers": "authorization,content-type", "Access-Control-Allow-Methods": "GET,OPTIONS" };
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    if (req.method() !== "GET") { unexpected.push(`Unexpected panel write ${req.url()}`); return route.abort(); }
    panelReads.push(new URL(req.url()));
    return route.fulfill({ headers, json: { business: { id: businessId, name: current.business.profile.name, slug: "native-kurulum", status: current.business.status }, businesses: [{ id: businessId, name: current.business.profile.name }], branch: { id: branchId, name: "Merkez" }, branches: [{ id: branchId, name: "Merkez" }], role: current.business.role, permissions: { calendar: true, customers: true, campaigns: true, inventory: true, reports: true, operations: true }, financialVisibility: true, customerVisibility: "all", person: "Kurulum Yöneticisi" } });
  });
  await page.route(endpoint, async (route) => {
    const req = route.request(); const url = new URL(req.url());
    const headers = { "Access-Control-Allow-Origin": "http://localhost:8082", "Access-Control-Allow-Headers": "authorization,content-type", "Access-Control-Allow-Methods": "GET,POST,OPTIONS" };
    const reply = (json: unknown, status = 200) => route.fulfill({ status, json, headers });
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    if (req.method() === "GET") {
      reads.push(url); readAuthorizations.push(req.headers().authorization ?? "");
      if (options.readFailure && readAttempts++ === 0) return reply({ error: "Native işletme kurulum altyapısı henüz etkin değil." }, 503);
      if (fresh) return reply({ ...current, business: null, location: null, images: [], totalImages: 0, hasMoreImages: false, coverIds: [], readiness: { openDays: 0, activeServices: 0, activeEmployees: 0, settingsPresent: false } });
      const offset = Number(url.searchParams.get("imageOffset") ?? 0);
      const count = options.imageCount ?? 2; const paged = state(options.manager ? "MANAGER" : "OWNER", offset, count);
      const images = [...state(options.manager ? "MANAGER" : "OWNER", 0, count).images, ...uploaded].slice(offset, offset + 25);
      return reply({ ...current, location: options.noLocation ? null : current.location, images: count > 25 && !uploaded.length ? paged.images : images, imageOffset: offset, totalImages: count + uploaded.length, hasMoreImages: offset + 25 < count + uploaded.length, ...(options.wrongScope ? { business: { ...current.business, id: categoryId } } : {}) });
    }
    if (req.method() !== "POST") { unexpected.push(`${req.method()} ${url}`); return reply({ error: "Unexpected method" }, 500); }
    const body = req.postDataJSON(); writes.push({ body, url, authorization: req.headers().authorization });
    if (failures-- > 0) return reply({ error: "Kayıt başka bir işlemde değişmiş. Taslağını koruyup yeniden dene." }, 409);
    if (options.rejectStaleProfile && body.action === "profile" && body.expectedRevision !== current.business.revision) return reply({ error: "Kayıt başka bir işlemde değişmiş. Taslağını koruyup yeniden dene." }, 409);
    if (body.action === "start") { fresh = false; current.business.profile.name = body.name; current.business.profile.description = body.description; return reply({ businessId, branchId }); }
    if (body.action === "profile") { current = { ...current, business: { ...current.business, profile: body.profile, revision: "2026-10-12T10:00:00.000Z" } }; return reply({ saved: true }); }
    if (body.action === "location") { current = { ...current, location: body.location }; return reply({ saved: true }); }
    if (body.action === "cover") { current = { ...current, coverIds: [body.id] }; return reply({ saved: true }); }
    if (body.action === "image") { uploaded.push({ id: body.id, url: "http://localhost:3001/brand/salonny-mark.png", kind: "gallery", altText: body.altText, contentHash: null }); return reply({ saved: true }); }
    if (body.action === "submit") { current.business.status = "pending_review"; return reply({ submitted: true, status: "pending_review", missing: [] }); }
    unexpected.push(`Unknown action ${body.action}`); return reply({ error: "Unexpected action" }, 500);
  });
  await signIn(page);
  await page.goto(options.fresh ? "/business-setup" : `/business-setup?${options.uppercase ? scope.toUpperCase().replace("BUSINESSID", "businessId").replace("BRANCHID", "branchId") : scope}`);
  return { writes, reads, readAuthorizations, panelReads, unexpected, otherWrites, changeServerProfile: () => { current = { ...current, business: { ...current.business, revision: "2026-10-12T10:00:00.000Z", profile: { ...current.business.profile, name: "Diğer yöneticinin güncel kaydı" } } }; } };
}
function safe(fixture: Awaited<ReturnType<typeof setup>>) {
  expect(fixture.otherWrites).toHaveLength(0); expect(fixture.unexpected).toHaveLength(0);
  expect(fixture.readAuthorizations.every((authorization) => /^Bearer /.test(authorization))).toBe(true);
  expect(fixture.writes.every(({ body, url, authorization }) => /^Bearer /.test(authorization ?? "") && (body.action === "start" ? !url.searchParams.has("businessId") : url.searchParams.get("businessId") === businessId && url.searchParams.get("branchId") === branchId))).toBe(true);
}
async function confirm(page: Page, button: string, expected: string, accept = true) {
  const answered = new Promise<void>((resolve) => page.once("dialog", async (dialog) => { expect(dialog.message()).toContain(expected); if (accept) await dialog.accept(); else await dialog.dismiss(); resolve(); }));
  await page.getByRole("button", { name: button, exact: true }).click(); await answered;
}

test("native setup requires authentication and never creates a business on opening", async ({ page }) => {
  const writes = await mockApi(page); await page.goto("/business-setup");
  await expect(page.getByText("İşletme kurulumu için kendi hesabınla giriş yap.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Giriş yap", exact: true })).toBeVisible();
  await expect(page.getByLabel("İşletme adı", { exact: true })).toHaveCount(0); expect(writes).toHaveLength(0);
});

test("new native business draft is explicit, validated and resumes inside the app", async ({ page, context }) => {
  const fixture = await setup(page, { fresh: true });
  await expect(page.getByRole("button", { name: "İşletme taslağını başlat", exact: true })).toBeVisible(); expect(fixture.writes).toHaveLength(0);
  await page.getByLabel("İşletme adı", { exact: true }).fill("A");
  await confirm(page, "İşletme taslağını başlat", "Taslak otomatik yayınlanmaz.");
  await expect(page.getByText("İşletme, kategori, iletişim ve konum bilgilerini kontrol et.", { exact: true })).toBeVisible(); expect(fixture.writes).toHaveLength(0);
  await page.getByLabel("İşletme adı", { exact: true }).fill("Kontrollü yeni salon");
  await page.getByLabel("İşletme açıklaması", { exact: true }).fill("Yalnız fixture taslağı");
  await confirm(page, "İşletme taslağını başlat", "Taslak otomatik yayınlanmaz.", false); expect(fixture.writes).toHaveLength(0);
  await confirm(page, "İşletme taslağını başlat", "Taslak otomatik yayınlanmaz.");
  await expect(page).toHaveURL(new RegExp(`/business-setup\\?${scope}`));
  await expect(page.getByLabel("İşletme adı", { exact: true })).toHaveValue("Kontrollü yeni salon");
  expect(fixture.writes[0].body).toEqual({ action: "start", name: "Kontrollü yeni salon", description: "Yalnız fixture taslağı" }); expect(context.pages()).toHaveLength(1); safe(fixture);
});

test("profile save carries optimistic revision and preserves a failed edit for retry", async ({ page }) => {
  const fixture = await setup(page, { writeFailure: 1 });
  await page.getByLabel("İşletme adı", { exact: true }).fill("Kaydedilecek yeni salon");
  await page.getByLabel("İşletme e-posta", { exact: true }).fill("salon@example.invalid");
  await page.getByRole("button", { name: "Profili kaydet", exact: true }).click();
  await expect(page.getByText("Kayıt başka bir işlemde değişmiş. Taslağını koruyup yeniden dene.", { exact: true })).toBeVisible();
  await expect(page.getByLabel("İşletme adı", { exact: true })).toHaveValue("Kaydedilecek yeni salon");
  await expect(page.getByText("Değişiklik kaydedildi.", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Profili kaydet", exact: true }).click();
  await expect(page.getByText("Değişiklik kaydedildi.", { exact: true })).toBeVisible();
  expect(fixture.writes).toHaveLength(2); expect(fixture.writes[0].body).toEqual(fixture.writes[1].body);
  expect(fixture.writes[1].body).toMatchObject({ action: "profile", expectedRevision: revision, profile: { name: "Kaydedilecek yeni salon", email: "salon@example.invalid", categoryId } }); safe(fixture);
});

test("background refresh cannot attach a newer revision to an old local profile draft", async ({ page }) => {
  await page.clock.install(); const fixture = await setup(page, { rejectStaleProfile: true });
  await page.getByLabel("İşletme adı", { exact: true }).fill("Yerel düzenleme korunmalı");
  fixture.changeServerProfile(); const initialReads = fixture.reads.length;
  await page.clock.fastForward(61_001); await page.evaluate(() => window.dispatchEvent(new Event("visibilitychange")));
  await expect.poll(() => fixture.reads.length).toBeGreaterThan(initialReads);
  await expect(page.getByLabel("İşletme adı", { exact: true })).toHaveValue("Yerel düzenleme korunmalı");
  await page.getByRole("button", { name: "Profili kaydet", exact: true }).click();
  await expect(page.getByText("Kayıt başka bir işlemde değişmiş. Taslağını koruyup yeniden dene.", { exact: true })).toBeVisible();
  expect(fixture.writes[0].body.expectedRevision).toBe(revision);
  await confirm(page, "Güncel kurulum kaydını yükle", "Kaydedilmemiş profil, konum ve fotoğraf seçimlerini", false);
  await expect(page.getByLabel("İşletme adı", { exact: true })).toHaveValue("Yerel düzenleme korunmalı");
  await confirm(page, "Güncel kurulum kaydını yükle", "Kaydedilmemiş profil, konum ve fotoğraf seçimlerini");
  await expect(page.getByLabel("İşletme adı", { exact: true })).toHaveValue("Diğer yöneticinin güncel kaydı");
  await page.getByLabel("İşletme adı", { exact: true }).fill("Güncel kayıt üstüne yeni düzenleme"); await page.getByRole("button", { name: "Profili kaydet", exact: true }).click();
  await expect(page.getByText("Değişiklik kaydedildi.", { exact: true })).toBeVisible();
  expect(fixture.writes[1].body.expectedRevision).toBe("2026-10-12T10:00:00.000Z"); safe(fixture);
});

test("branch coordinates move only after explicit save with complete prior location CAS", async ({ page }) => {
  const fixture = await setup(page);
  await page.getByRole("button", { name: "2. Konum", exact: true }).click();
  await expect(page.getByText(/Konum otomatik alınmaz/)).toBeVisible();
  await page.getByLabel("Enlem", { exact: true }).fill("49");
  await page.getByRole("button", { name: "Konumu kaydet", exact: true }).click();
  await expect(page.getByText("Geçerli enlem ve boylam seç.", { exact: true })).toBeVisible(); expect(fixture.writes).toHaveLength(0);
  await page.getByLabel("Enlem", { exact: true }).fill("38.412345"); await page.getByLabel("Boylam", { exact: true }).fill("27.212345");
  await page.getByLabel("Açık adres", { exact: true }).fill("Yeni Test Caddesi No: 10"); expect(fixture.writes).toHaveLength(0);
  await page.getByRole("button", { name: "Konumu kaydet", exact: true }).click();
  await expect(page.getByText("Değişiklik kaydedildi.", { exact: true })).toBeVisible();
  expect(fixture.writes[0].body).toEqual({ action: "location", location: { ...location, addressLine: "Yeni Test Caddesi No: 10", latitude: 38.412345, longitude: 27.212345 }, expected: location }); safe(fixture);
});

test("a district-only new location draft cannot be silently lost when leaving the native screen", async ({ page }) => {
  const fixture = await setup(page, { noLocation: true });
  // Use actual in-app navigation so this exercises the native stack removal
  // guard instead of replacing the entire app with a browser page.goto.
  await page.goto("/profile"); await page.getByRole("button", { name: "İşletme kurulumunu ve görsellerini düzenle", exact: true }).click();
  await page.getByRole("button", { name: "2. Konum", exact: true }).click(); await page.getByLabel("İlçe", { exact: true }).fill("Yalnız yeni ilçe");
  await confirm(page, "Profilime dön", "Yerel taslağı bırakıp", false);
  await expect(page.getByLabel("İlçe", { exact: true })).toHaveValue("Yalnız yeni ilçe"); expect(fixture.writes).toHaveLength(0);
  await confirm(page, "Profilime dön", "Yerel taslağı bırakıp"); await expect(page).toHaveURL(/\/profile$/); safe(fixture);
});

test("photos paginate on demand and do not discard unsaved profile edits", async ({ page }) => {
  const fixture = await setup(page, { imageCount: 27 });
  await page.getByLabel("İşletme adı", { exact: true }).fill("Kaydedilmemiş ad");
  await page.getByRole("button", { name: "3. Fotoğraflar", exact: true }).click();
  const next = page.getByRole("button", { name: "Sonraki fotoğraflar", exact: true }); await next.scrollIntoViewIfNeeded(); await expect(next).toBeDisabled();
  expect(fixture.reads.some((url) => url.searchParams.get("imageOffset") === "25")).toBe(false);
  await page.getByRole("button", { name: "1. Profil ve kategori", exact: true }).click(); await page.getByRole("button", { name: "Profili kaydet", exact: true }).click();
  await expect(page.getByText("Değişiklik kaydedildi.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "3. Fotoğraflar", exact: true }).click(); await next.scrollIntoViewIfNeeded(); await expect(next).toBeEnabled(); await next.click();
  // Re-enter the tab only if the editor remounts; retaining the tab is also
  // supported. The important contract is fresh, correctly paged image state.
  await page.getByRole("button", { name: "3. Fotoğraflar", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sonraki fotoğraflar", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Önceki fotoğraflar", exact: true })).toBeVisible();
  expect(fixture.reads.some((url) => url.searchParams.get("imageOffset") === "25")).toBe(true); safe(fixture);
});

test("cover selection sends the complete previous cover set and no upload or delete", async ({ page }) => {
  const fixture = await setup(page); await page.getByRole("button", { name: "3. Fotoğraflar", exact: true }).click();
  await expect(page.getByText(/Konum\/EXIF bilgileri sunucuda kaldırılır/)).toBeVisible();
  await page.getByRole("button", { name: "Kapak olarak seç", exact: true }).click();
  await expect(page.getByText("Değişiklik kaydedildi.", { exact: true })).toBeVisible();
  expect(fixture.writes).toHaveLength(1); expect(fixture.writes[0].body).toEqual({ action: "cover", id: imageId(2), expectedCoverIds: [imageId(1)] }); safe(fixture);
});

test("selected image stays local until explicit publish and uses one stable id across retry", async ({ page, context }) => {
  const fixture = await setup(page, { writeFailure: 1 }); await page.getByRole("button", { name: "3. Fotoğraflar", exact: true }).click();
  const selected = page.waitForEvent("filechooser"); await page.getByRole("button", { name: "Fotoğraf seç", exact: true }).click();
  const png = await sharp({ create: { width: 32, height: 32, channels: 3, background: "#6C4BF4" } }).png().toBuffer();
  await (await selected).setFiles({ name: "controlled-test-image.png", mimeType: "image/png", buffer: png });
  const publish = page.getByRole("button", { name: "Seçtiğim görseli yayınla", exact: true }); await expect(publish).toBeVisible(); expect(fixture.writes).toHaveLength(0);
  await publish.click(); await expect(page.getByText("Kayıt başka bir işlemde değişmiş. Taslağını koruyup yeniden dene.", { exact: true })).toBeVisible();
  await expect(publish).toBeEnabled(); await publish.click(); await expect(page.getByText("Değişiklik kaydedildi.", { exact: true })).toBeVisible();
  await expect(publish).toHaveCount(0); expect(fixture.writes).toHaveLength(2); expect(fixture.writes[0].body).toEqual(fixture.writes[1].body);
  expect(fixture.writes[1].body).toMatchObject({ action: "image", altText: `${profile.name} işletme görseli` });
  expect(fixture.writes[1].body.id).toMatch(/^[0-9a-f-]{36}$/); expect(fixture.writes[1].body.base64).toMatch(/^\/9j\//);
  expect(context.pages()).toHaveLength(1); safe(fixture);
});

test("manager may edit setup but cannot submit owner-only review", async ({ page }) => {
  const fixture = await setup(page, { manager: true });
  await expect(page.getByRole("button", { name: "Profili kaydet", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "4. Son kontroller", exact: true }).click();
  await expect(page.getByRole("button", { name: "İncelemeye gönder", exact: true })).toBeDisabled(); expect(fixture.writes).toHaveLength(0); safe(fixture);
});

test("owner review is confirmed and describes pending review rather than publication", async ({ page, context }) => {
  const fixture = await setup(page); await page.getByRole("button", { name: "4. Son kontroller", exact: true }).click();
  await confirm(page, "İncelemeye gönder", "otomatik yayın yapılmaz.", false); expect(fixture.writes).toHaveLength(0);
  await confirm(page, "İncelemeye gönder", "otomatik yayın yapılmaz.");
  await expect(page.getByText("İşletmen incelemeye gönderildi. Otomatik yayınlanmaz.", { exact: true })).toBeVisible();
  expect(fixture.writes[0].body).toEqual({ action: "submit" }); expect(context.pages()).toHaveLength(1); safe(fixture);
  await page.screenshot({ path: "artifacts/mobile-native-business-setup.jpg", type: "jpeg", quality: 90 });
});

test("missing setup backend produces explicit retry and never a false empty editable profile", async ({ page }) => {
  const fixture = await setup(page, { readFailure: true });
  await expect(page.getByText("Native işletme kurulum altyapısı henüz etkin değil.", { exact: true })).toBeVisible();
  await expect(page.getByLabel("İşletme adı", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Kurulumu yeniden yükle", exact: true }).click();
  await expect(page.getByLabel("İşletme adı", { exact: true })).toHaveValue(profile.name); expect(fixture.writes).toHaveLength(0); safe(fixture);
});

test("wrong-tenant setup DTO is rejected before private editor state is shown", async ({ page }) => {
  const fixture = await setup(page, { wrongScope: true });
  await expect(page.getByText("Kurulum verisi doğrulanamadı. Yeniden yükle.", { exact: true })).toBeVisible();
  await expect(page.getByLabel("İşletme adı", { exact: true })).toHaveCount(0); expect(fixture.writes).toHaveLength(0); safe(fixture);
});

test("uppercase business and branch UUID links open the canonical native setup", async ({ page }) => {
  const fixture = await setup(page, { uppercase: true });
  await expect(page.getByLabel("İşletme adı", { exact: true })).toHaveValue(profile.name);
  await expect(page.getByText("Kurulum verisi doğrulanamadı. Yeniden yükle.", { exact: true })).toHaveCount(0); expect(fixture.writes).toHaveLength(0); safe(fixture);
});

test("setup remains within narrow phone width and opens the selected native panel scope", async ({ page, context }) => {
  const fixture = await setup(page); await page.setViewportSize({ width: 320, height: 844 });
  const field = await page.getByLabel("İşletme adı", { exact: true }).boundingBox(); expect(field!.x).toBeGreaterThanOrEqual(20); expect(field!.x + field!.width).toBeLessThanOrEqual(300);
  await page.getByRole("button", { name: "4. Son kontroller", exact: true }).click();
  await page.getByRole("button", { name: "Native işletme panelini aç", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/manage/settings\\?${scope}`));
  await expect(page.getByText(profile.name, { exact: true })).toBeVisible();
  expect(fixture.panelReads).toHaveLength(1); expect(fixture.panelReads[0].searchParams.get("businessId")).toBe(businessId); expect(fixture.panelReads[0].searchParams.get("branchId")).toBe(branchId);
  expect(context.pages()).toHaveLength(1); expect(fixture.writes).toHaveLength(0); safe(fixture);
});
