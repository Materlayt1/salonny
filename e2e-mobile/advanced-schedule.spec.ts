import { expect, test, type Page } from "@playwright/test";
import { appointmentId, business, mockApi, signIn } from "./fixtures";

test.use({ deviceScaleFactor: 1, viewport: { width: 390, height: 844 } });

const employeeId = business.employees[0].id;
const endpoint = "/api/business-management/employee-schedule";
const periodId = "40000000-0000-4000-8000-000000000001";
type Period = { id: string; weekday: number; startsAt: string; endsAt: string; validFrom: string | null; validUntil: string | null };
const period: Period = { id: periodId, weekday: 0, startsAt: "09:00", endsAt: "12:00", validFrom: null, validUntil: null };
const precisePeriod: Period = { ...period, startsAt: "09:00:00.125456", endsAt: "12:00:00.654321", validFrom: "2026-11-01", validUntil: "2026-11-30" };
type ScheduleOptions = { manager?: boolean; precise?: boolean; paginated?: boolean; branchPages?: boolean; inactiveCleanup?: boolean; readFailure?: boolean; writeFailure?: boolean; conflict?: "stale" | "overlap" | "branch"; pending?: Promise<void> };

// Every identity, employee, branch and write in this suite is a local fixture. The
// auth/config requests are intercepted by mockApi, never a real staff account.
async function scheduleApi(page: Page, options: ScheduleOptions = {}) {
  const writes: Array<{ body: Record<string, unknown>; url: URL; authorization?: string }> = [];
  const reads: URL[] = [];
  const unexpectedNetwork: string[] = [];
  let failures = 0;
  let assigned = false;
  let periods: Period[] = options.paginated ? Array.from({ length: 26 }, (_, index) => ({
    ...period, id: `40000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    validFrom: `2027-01-${String(index + 1).padStart(2, "0")}`,
    validUntil: `2027-01-${String(index + 1).padStart(2, "0")}`,
  })) : [{ ...(options.precise ? precisePeriod : period) }];

  await page.route(/https:\/\/[^/]*\.supabase\.co\/.*/, async (route) => {
    unexpectedNetwork.push(route.request().url());
    await route.abort();
  });
  await page.route(`http://localhost:3001${endpoint}**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const headers = {
      "Access-Control-Allow-Origin": "http://localhost:8082",
      "Access-Control-Allow-Headers": "authorization,content-type",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    };
    const respond = (body: unknown, status = 200) => route.fulfill({ status, json: body, headers });
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    if (request.method() === "GET") {
      reads.push(url);
      if (options.readFailure && reads.length === 1) return respond({ error: "Çalışan vardiyaları alınamadı." }, 503);
      const offset = Number(url.searchParams.get("offset") ?? 0);
      const branchOffset = Number(url.searchParams.get("branchOffset") ?? 0);
      const inactive = options.inactiveCleanup && url.searchParams.get("branchId") === appointmentId;
      const branches = options.branchPages ? Array.from({ length: 51 }, (_, index) => ({
        id: index === 0 ? business.branchId : `40000000-0000-4000-9000-${String(index).padStart(12, "0")}`,
        name: `Test şube ${index + 1}`, active: true, assigned: index === 0,
      })) : [{ id: business.branchId, name: "Merkez", active: true, assigned: true }, { id: appointmentId, name: "İkinci şube", active: !options.inactiveCleanup, assigned: options.inactiveCleanup || assigned }];
      return respond({
        employee: { id: employeeId, name: "Test uzmanı", active: true },
        branch: { id: inactive ? appointmentId : business.branchId, name: inactive ? "İkinci şube" : "Merkez", active: !inactive },
        timezone: "Europe/Istanbul", assigned: true,
        branches: branches.slice(branchOffset, branchOffset + 50), totalBranches: branches.length, hasMoreBranches: branchOffset + 50 < branches.length,
        periods: periods.slice(offset, offset + 25), total: periods.length, hasMore: offset + 25 < periods.length,
      });
    }
    const body = request.postDataJSON();
    writes.push({ body, url, authorization: request.headers().authorization });
    if (options.pending) await options.pending;
    if (options.writeFailure && failures++ === 0) return respond({ error: "Vardiya kaydedilemedi. Yeniden dene." }, 503);
    if (options.conflict === "stale") return respond({ error: "Bu vardiya başka bir işlemde değişti. Güncel kaydı yükle." }, 409);
    if (options.conflict === "overlap") return respond({ error: "Aynı gün ve tarih aralığında vardiyalar çakışamaz." }, 409);
    if (options.conflict === "branch" && body.action === "setBranch" && !body.assigned) return respond({ error: "Gelecek randevuları bulunan çalışanın şube bağlantısı kaldırılamaz." }, 409);
    if (body.action === "createPeriod") periods = [...periods, { id: body.id, ...body.period }];
    if (body.action === "updatePeriod") periods = periods.map((row) => row.id === body.id ? { id: row.id, ...body.period } : row);
    if (body.action === "deletePeriod") periods = periods.filter((row) => row.id !== body.id);
    if (body.action === "setBranch") assigned = body.assigned;
    return respond({ saved: true, id: body.id });
  });
  return { writes, reads, unexpectedNetwork, inactiveCleanup: options.inactiveCleanup };
}

function assertScope(records: Array<{ url: URL; authorization?: string }>, inactiveCleanup = false) {
  expect(records.every(({ url }) => url.searchParams.get("businessId") === business.id && [business.branchId, ...(inactiveCleanup ? [appointmentId] : [])].includes(url.searchParams.get("branchId") ?? ""))).toBe(true);
}

const safety = new WeakMap<Page, { otherWrites: unknown[]; fixture: Awaited<ReturnType<typeof scheduleApi>> }>();
async function openSchedule(page: Page, options: ScheduleOptions = {}) {
  const otherWrites = await mockApi(page, { businessAccount: true, advancedSchedule: true });
  const fixture = await scheduleApi(page, options);
  safety.set(page, { otherWrites, fixture });
  if (options.manager) await page.route("http://localhost:3001/api/business-management/context**", async (route) => {
    const headers = { "Access-Control-Allow-Origin": "http://localhost:8082", "Access-Control-Allow-Headers": "authorization,content-type", "Access-Control-Allow-Methods": "GET,OPTIONS" };
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    return route.fulfill({ headers, json: {
      business, businesses: [{ id: business.id, name: business.name }],
      branch: { id: business.branchId, name: "Merkez" }, branches: [{ id: business.branchId, name: "Merkez" }, { id: appointmentId, name: "İkinci şube" }],
      role: "MANAGER", permissions: { calendar: true, customers: true, campaigns: true, inventory: true, reports: true, operations: true },
      financialVisibility: true, customerVisibility: "all", person: "Test Yönetici",
    } });
  });
  await signIn(page);
  await page.goto("/manage/employees");
  await page.getByRole("button", { name: "İleri vardiyalar ve şubeler", exact: true }).click();
  return fixture;
}
async function newPeriod(page: Page) {
  await page.getByRole("button", { name: "Yeni vardiya dönemi", exact: true }).click();
  await page.getByLabel("Vardiya başlangıç saati", { exact: true }).fill("13:00");
  await page.getByLabel("Vardiya bitiş saati", { exact: true }).fill("17:30");
}
function snapshot(row: Period) {
  return { weekday: row.weekday, startsAt: row.startsAt, endsAt: row.endsAt, validFrom: row.validFrom, validUntil: row.validUntil };
}
const periodCard = (page: Page, id = periodId) => page.getByTestId(`employee-period-${id}`);
test.afterEach(async ({ page }) => {
  const state = safety.get(page);
  if (!state) return;
  expect(state.otherWrites, "No raw table, unrelated management, appointment or customer writes").toEqual([]);
  expect(state.fixture.unexpectedNetwork, "No real Supabase authentication/data traffic").toEqual([]);
  assertScope([...state.fixture.writes, ...state.fixture.reads.map((url) => ({ url }))], state.fixture.inactiveCleanup);
  expect(state.fixture.writes.every(({ authorization }) => /^Bearer /.test(authorization ?? ""))).toBe(true);
});

test("inactive branch periods are reachable for cleanup without allowing new shifts", async ({ page }) => {
  const fixture = await openSchedule(page, { inactiveCleanup: true });
  await page.getByRole("button", { name: "Şube atamaları", exact: true }).click();
  await page.getByRole("button", { name: "Vardiyaları aç: İkinci şube", exact: true }).click();
  await expect(page.getByText("Şube pasif.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Yeni vardiya dönemi", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Vardiyayı düzenle: Pazartesi 09:00", exact: true })).toBeDisabled();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Vardiyayı kaldır: Pazartesi 09:00", exact: true }).click();
  await expect(page.getByText("Vardiya dönemi kaldırıldı.", { exact: true })).toBeVisible();
  expect(fixture.writes).toHaveLength(1);
  expect(fixture.writes[0].url.searchParams.get("branchId")).toBe(appointmentId);
  expect(fixture.writes[0].body.action).toBe("deletePeriod");
});

test("advanced native schedule creates one dated split shift with a stable id and tenant scope", async ({ page, context }) => {
  const { writes, reads } = await openSchedule(page);
  await expect(page.getByText(/Özel vardiya olmayan günlerde/)).toBeVisible();
  await newPeriod(page);
  await page.getByLabel("Geçerlilik başlangıcı", { exact: true }).fill("2026-11-01");
  await page.getByLabel("Geçerlilik sonu", { exact: true }).fill("2026-11-30");
  await page.getByRole("button", { name: "Vardiya dönemini kaydet", exact: true }).click();
  await expect(page.getByText("Vardiya dönemi kaydedildi.", { exact: true })).toBeVisible();
  expect(writes).toHaveLength(1);
  expect(writes[0].body).toMatchObject({ action: "createPeriod", employeeId, period: { weekday: 0, startsAt: "13:00", endsAt: "17:30", validFrom: "2026-11-01", validUntil: "2026-11-30" } });
  expect(writes[0].body.id).toMatch(/^[0-9a-f-]{36}$/);
  expect(reads.every((url) => url.searchParams.get("employeeId") === employeeId)).toBe(true);
  expect(context.pages()).toHaveLength(1);
  await page.screenshot({ path: "artifacts/mobile-native-advanced-schedule.jpg", type: "jpeg", quality: 95 });
});

test("editing a legacy shift preserves full seconds and microseconds in the optimistic snapshot", async ({ page }) => {
  const { writes } = await openSchedule(page, { precise: true });
  await periodCard(page).getByRole("button", { name: /^Vardiyayı düzenle:/ }).click();
  await expect(page.getByLabel("Vardiya başlangıç saati", { exact: true })).toHaveValue(precisePeriod.startsAt);
  await expect(page.getByLabel("Vardiya bitiş saati", { exact: true })).toHaveValue(precisePeriod.endsAt);
  await page.getByLabel("Geçerlilik sonu", { exact: true }).fill("2026-12-31");
  await page.getByRole("button", { name: "Vardiya dönemini kaydet", exact: true }).click();
  await expect(page.getByText("Vardiya dönemi kaydedildi.", { exact: true })).toBeVisible();
  expect(writes[0].body).toEqual({ action: "updatePeriod", employeeId, id: periodId, expected: snapshot(precisePeriod), period: { ...snapshot(precisePeriod), validUntil: "2026-12-31" } });
});

test("stale shift conflicts retain edited fields and never overwrite with a bulk schedule", async ({ page }) => {
  const { writes, reads } = await openSchedule(page, { conflict: "stale" });
  await periodCard(page).getByRole("button", { name: /^Vardiyayı düzenle:/ }).click();
  await page.getByLabel("Vardiya bitiş saati", { exact: true }).fill("12:30");
  await page.getByRole("button", { name: "Vardiya dönemini kaydet", exact: true }).click();
  await expect(page.getByText(/Bu vardiya başka bir işlemde değişti/)).toBeVisible();
  await expect(page.getByLabel("Vardiya bitiş saati", { exact: true })).toHaveValue("12:30");
  expect(writes).toHaveLength(1);
  expect(writes[0].body).toMatchObject({ action: "updatePeriod", id: periodId, expected: snapshot(period) });
  const beforeRefresh = reads.length;
  await page.getByRole("button", { name: "Vardiya listesini yenile", exact: true }).click();
  await expect.poll(() => reads.length).toBe(beforeRefresh + 1);
  await expect(page.getByLabel("Vardiya bitiş saati", { exact: true })).toHaveValue("12:30");
  expect(writes).toHaveLength(1);
});

test("overlapping additive shifts show a server conflict without discarding the new period", async ({ page }) => {
  const { writes } = await openSchedule(page, { conflict: "overlap" });
  await newPeriod(page);
  await page.getByLabel("Vardiya başlangıç saati", { exact: true }).fill("10:00");
  await page.getByRole("button", { name: "Vardiya dönemini kaydet", exact: true }).click();
  await expect(page.getByText(/Aynı gün ve tarih aralığında vardiyalar çakışamaz/)).toBeVisible();
  await expect(page.getByLabel("Vardiya başlangıç saati", { exact: true })).toHaveValue("10:00");
  expect(writes).toHaveLength(1);
  expect(writes[0].body.action).toBe("createPeriod");
});

test("branch assignment changes a single edge and blocked future-appointment removal stays checked", async ({ page }) => {
  const { writes } = await openSchedule(page, { conflict: "branch" });
  await page.getByRole("button", { name: "Şube atamaları", exact: true }).click();
  const branch = page.getByLabel("Şube ataması: İkinci şube", { exact: true });
  await expect(branch).not.toBeChecked();
  await branch.click();
  await expect(branch).toBeChecked();
  expect(writes[0].body).toEqual({ action: "setBranch", employeeId, targetBranchId: appointmentId, assigned: true, expectedAssigned: false });
  page.once("dialog", (dialog) => dialog.accept());
  await branch.click();
  await expect(page.getByText(/Gelecek randevuları bulunan çalışanın şube bağlantısı kaldırılamaz/)).toBeVisible();
  await expect(branch).toBeChecked();
  expect(writes[1].body).toEqual({ action: "setBranch", employeeId, targetBranchId: appointmentId, assigned: false, expectedAssigned: true });
});

test("advanced periods load in batches of 25 only after an explicit next-page request", async ({ page }) => {
  const { reads, writes } = await openSchedule(page, { paginated: true });
  await expect(periodCard(page)).toBeVisible();
  const lastId = "40000000-0000-4000-8000-000000000026";
  await expect(periodCard(page, lastId)).toHaveCount(0);
  expect(reads.some((url) => url.searchParams.get("offset") === "25")).toBe(false);
  await page.getByRole("button", { name: "Daha fazla vardiya dönemi", exact: true }).click();
  await expect(periodCard(page, lastId)).toBeVisible();
  expect(reads.some((url) => url.searchParams.get("offset") === "25")).toBe(true);
  expect(writes).toHaveLength(0);
});

test("branch pagination is independent of period pagination and does not duplicate or lose periods", async ({ page }) => {
  const { reads, writes } = await openSchedule(page, { branchPages: true });
  await expect(periodCard(page)).toBeVisible();
  await page.getByRole("button", { name: "Şube atamaları", exact: true }).click();
  await expect(page.getByLabel("Şube ataması: Test şube 1", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Şube ataması: Test şube 51", { exact: true })).toHaveCount(0);
  expect(reads.some((url) => url.searchParams.get("branchOffset") === "50")).toBe(false);
  await page.getByRole("button", { name: "Daha fazla şube", exact: true }).click();
  await expect(page.getByLabel("Şube ataması: Test şube 51", { exact: true })).toBeVisible();
  expect(reads.some((url) => url.searchParams.get("branchOffset") === "50")).toBe(true);
  await expect(page.getByLabel("Şube ataması: Test şube 1", { exact: true })).toHaveCount(1);
  await page.getByRole("button", { name: "Vardiya dönemleri", exact: true }).click();
  await expect(periodCard(page)).toHaveCount(1);
  await periodCard(page).getByRole("button", { name: /^Vardiyayı düzenle:/ }).click();
  await expect(page.getByLabel("Vardiya başlangıç saati", { exact: true })).toHaveValue(period.startsAt);
  expect(writes).toHaveLength(0);
});

test("real calendar dates, precision and same-day ordering are validated before scoped writes", async ({ page }) => {
  const { writes } = await openSchedule(page);
  await newPeriod(page);
  await page.getByLabel("Geçerlilik başlangıcı", { exact: true }).fill("2026-02-30");
  await page.getByLabel("Vardiya başlangıç saati", { exact: true }).fill("09:00.5");
  await page.getByRole("button", { name: "Vardiya dönemini kaydet", exact: true }).click();
  await expect(page.getByText(/Gerçek bir tarihi YIL-AY-GÜN/)).toBeVisible();
  await expect(page.getByText(/Saati SS:DD veya SS:DD:ss/)).toBeVisible();
  expect(writes).toHaveLength(0);
  await page.getByLabel("Geçerlilik başlangıcı", { exact: true }).fill("");
  await page.getByLabel("Vardiya başlangıç saati", { exact: true }).fill("23:30");
  await page.getByLabel("Vardiya bitiş saati", { exact: true }).fill("00:30");
  await page.getByRole("button", { name: "Vardiya dönemini kaydet", exact: true }).click();
  await expect(page.getByText(/geceye taşan vardiyayı iki güne böl/)).toBeVisible();
  expect(writes).toHaveLength(0);
});

test("a pending native period save disables controls and suppresses duplicate submits", async ({ page }) => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  const { writes } = await openSchedule(page, { pending });
  await newPeriod(page);
  const button = page.getByRole("button", { name: "Vardiya dönemini kaydet", exact: true });
  const control = await button.elementHandle();
  await button.click();
  try {
    await expect.poll(() => writes.length).toBe(1);
    await expect(page.getByLabel("Vardiya başlangıç saati", { exact: true })).not.toBeEditable();
    await expect.poll(() => control!.getAttribute("aria-disabled")).toBe("true");
    await control!.dispatchEvent("click");
    expect(writes).toHaveLength(1);
  } finally { release(); }
  await expect(page.getByText("Vardiya dönemi kaydedildi.", { exact: true })).toBeVisible();
  expect(writes).toHaveLength(1);
});

test("an unavailable endpoint retains values and a manual retry reuses the exact create id", async ({ page }) => {
  const { writes } = await openSchedule(page, { writeFailure: true });
  await newPeriod(page);
  await page.getByLabel("Geçerlilik başlangıcı", { exact: true }).fill("2026-11-01");
  await page.getByRole("button", { name: "Vardiya dönemini kaydet", exact: true }).click();
  await expect(page.getByText(/İleri vardiya servisi şu anda kullanılamıyor/)).toBeVisible();
  await expect(page.getByLabel("Vardiya başlangıç saati", { exact: true })).toHaveValue("13:00");
  await expect(page.getByLabel("Geçerlilik başlangıcı", { exact: true })).toHaveValue("2026-11-01");
  expect(writes).toHaveLength(1);
  await page.screenshot({ path: "artifacts/mobile-native-advanced-schedule-offline.jpg", type: "jpeg", quality: 95 });
  await page.getByRole("button", { name: "Vardiya dönemini kaydet", exact: true }).click();
  await expect(page.getByText("Vardiya dönemi kaydedildi.", { exact: true })).toBeVisible();
  expect(writes).toHaveLength(2);
  expect(writes[1].body).toEqual(writes[0].body);
});

test("deleting one period requires confirmation and carries the complete expected snapshot", async ({ page }) => {
  const { writes } = await openSchedule(page, { precise: true });
  const remove = periodCard(page).getByRole("button", { name: /^Vardiyayı kaldır:/ });
  page.once("dialog", (dialog) => dialog.dismiss());
  await remove.click();
  expect(writes).toHaveLength(0);
  page.once("dialog", (dialog) => dialog.accept());
  await remove.click();
  await expect(remove).toHaveCount(0);
  expect(writes[0].body).toEqual({ action: "deletePeriod", employeeId, id: periodId, expected: snapshot(precisePeriod) });
});

test("unsaved advanced period fields cannot be discarded without explicit confirmation", async ({ page }) => {
  const { writes } = await openSchedule(page);
  await newPeriod(page);
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Vardiya listesine dön", exact: true }).click();
  await expect(page.getByLabel("Vardiya başlangıç saati", { exact: true })).toHaveValue("13:00");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Vardiya listesine dön", exact: true }).click();
  await expect(page.getByLabel("Vardiya başlangıç saati", { exact: true })).toHaveCount(0);
  await expect(periodCard(page)).toBeVisible();
  expect(writes).toHaveLength(0);
});

test("read failures prevent writing and can be recovered by an explicit reload", async ({ page }) => {
  const { writes, reads } = await openSchedule(page, { readFailure: true });
  await expect(page.getByText(/İleri vardiya servisi şu anda kullanılamıyor/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Yeni vardiya dönemi", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "İleri vardiyaları yeniden yükle", exact: true }).click();
  await expect(periodCard(page)).toBeVisible();
  expect(reads).toHaveLength(2);
  expect(writes).toHaveLength(0);
});

test("ordinary employee accounts cannot open advanced staff schedule tools", async ({ page }) => {
  await mockApi(page, { businessAccount: true, employee: true });
  const fixture = await scheduleApi(page);
  await signIn(page);
  await page.goto("/manage/employees");
  await expect(page.getByText("Test uzmanı", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Hizmetler ve müsaitlik", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "İleri vardiyalar ve şubeler", exact: true })).toHaveCount(0);
  expect(fixture.reads).toHaveLength(0);
  expect(fixture.writes).toHaveLength(0);
});

test("authorized manager accounts can use native advanced shift tools in their current branch", async ({ page }) => {
  const { writes } = await openSchedule(page, { manager: true });
  await expect(periodCard(page)).toBeVisible();
  await newPeriod(page);
  await page.getByRole("button", { name: "Vardiya dönemini kaydet", exact: true }).click();
  await expect(page.getByText("Vardiya dönemi kaydedildi.", { exact: true })).toBeVisible();
  expect(writes).toHaveLength(1);
  expect(writes[0].body).toMatchObject({ action: "createPeriod", employeeId });
});
