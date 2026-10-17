import { expect, test, type Page, type Route } from "@playwright/test";
import { businessReportQuery, businessReportSchema, type BusinessReport, type ReportDimension } from "../lib/business-report-contract";
import { appointmentId, business, mockApi, session, signIn } from "./fixtures";

test.use({ deviceScaleFactor: 1, viewport: { width: 390, height: 844 } });

const endpoint = "/api/business-management/report-summary";
const secondBusinessId = "50000000-0000-4000-8000-000000000001";
const secondBranchId = "50000000-0000-4000-8000-000000000002";
const headers = {
  "Access-Control-Allow-Origin": "http://localhost:8082",
  "Access-Control-Allow-Headers": "authorization,content-type",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
};
function dateShift(value: string, days: number) {
  return new Date(Date.parse(`${value}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

type ReportOptions = {
  employee?: boolean;
  authorizedEmployee?: boolean;
  firstFailure?: boolean;
  empty?: boolean;
  mixedCurrencies?: boolean;
  unsafeInteger?: boolean;
  paginated?: boolean;
  noCapacity?: boolean;
  secondBusiness?: boolean;
  revokedSecondBusiness?: boolean;
  invalid?: "amount" | "scope" | "series" | "minutes";
  pendingFirst?: Promise<void>;
  changedPage?: boolean;
  rotatingToken?: boolean;
};

// Synthetic identities, amounts, plans and tokens only. No report test is
// allowed to authenticate against real Supabase or create a business record.
function payload(url: URL, options: ReportOptions): BusinessReport {
  const days = Number(url.searchParams.get("days") ?? 30) as 7 | 30 | 90;
  const dimension = (url.searchParams.get("dimension") ?? "service") as ReportDimension;
  const offset = Number(url.searchParams.get("offset") ?? 0);
  const allBranches = url.searchParams.get("allBranches") === "true";
  const isSecondBusiness = url.searchParams.get("businessId") === secondBusinessId;
  const isSecondBranch = url.searchParams.get("branchId") === appointmentId;
  const toExclusive = "2026-10-11";
  const from = dateShift(toExclusive, -days);
  const values = options.empty ? [] : [
    { currency: "TRY", minor: options.unsafeInteger ? "9007199254740993" : "40000" },
    ...(options.mixedCurrencies ? [{ currency: "USD", minor: "5050" }] : []),
  ];
  const current = { total: options.empty ? 0 : options.changedPage && offset > 0 ? 121 : 120, completed: options.empty ? 0 : 80, cancelled: options.empty ? 0 : 20, noShow: options.empty ? 0 : 10, bookedMinutes: options.empty ? 0 : 3000, values };
  const previous = options.empty ? { total: 0, completed: 0, cancelled: 0, noShow: 0, bookedMinutes: 0, values: [] } : { total: 60, completed: 40, cancelled: 10, noShow: 5, bookedMinutes: 1500, values: [{ currency: "TRY", minor: "20000" }] };
  const names = dimension === "service" ? ["Saç kesimi", "Son hizmet"] : dimension === "employee" ? ["Test uzmanı", "Son uzman"] : ["Merkez", "Son şube"];
  const count = options.empty ? 0 : options.paginated ? 26 : 1;
  const rows = Array.from({ length: count }, (_, index) => ({
    id: `50000000-0000-4000-${dimension === "service" ? "8001" : dimension === "employee" ? "8002" : "8003"}-${String(index + 1).padStart(12, "0")}`,
    label: isSecondBusiness ? "Yeni işletme raporu" : isSecondBranch ? "İkinci şube raporu" : index === 0 ? names[0] : index === 25 ? names[1] : `${names[0]} ${index + 1}`,
    total: count === 1 ? current.total : 1,
    completed: count === 1 ? current.completed : 1,
    cancelled: count === 1 ? current.cancelled : 0,
    noShow: count === 1 ? current.noShow : 0,
    bookedMinutes: count === 1 ? current.bookedMinutes : 30,
    values: dimension === "service" ? null : count === 1 ? values : [{ currency: "TRY", minor: "100" }],
  }));
  return {
    generatedAt: "2026-10-11T12:00:00Z",
    period: { from, toExclusive, previousFrom: dateShift(from, -days), days, timezone: "Europe/Istanbul" },
    scope: { businessId: url.searchParams.get("businessId") ?? business.id, branchId: allBranches ? null : url.searchParams.get("branchId") ?? business.branchId, allBranches, employeeId: options.authorizedEmployee ? business.employees[0].id : null },
    summary: { current, previous },
    daily: Array.from({ length: days }, (_, index) => ({ date: dateShift(from, index), ...(index === 0 ? current : { total: 0, completed: 0, cancelled: 0, noShow: 0, bookedMinutes: 0, values: [] }) })),
    breakdown: { dimension, offset, total: count, hasMore: offset + 25 < count, rows: rows.slice(offset, offset + 25) },
    utilization: { from: dateShift(toExclusive, 1), toExclusive: dateShift(toExclusive, 8), days: 7, availableMinutes: options.noCapacity ? 0 : 1000, busyMinutes: options.noCapacity ? 0 : 250, outsideCapacityMinutes: options.noCapacity ? 45 : 120, ratio: options.noCapacity ? null : 0.25, basis: "current_plan", historical: false },
  };
}

const safety = new WeakMap<Page, {
  reads: Array<{ url: URL; authorization?: string; expectedAuthorization: string }>;
  writes: string[];
  otherWrites: Awaited<ReturnType<typeof mockApi>>;
  unexpectedNetwork: string[];
}>();

async function reportApi(page: Page, options: ReportOptions = {}) {
  const otherWrites = await mockApi(page, { businessAccount: true, employee: options.employee || options.authorizedEmployee });
  const reads: Array<{ url: URL; authorization?: string; expectedAuthorization: string }> = [];
  const writes: string[] = [];
  const unexpectedNetwork: string[] = [];
  let currentToken = session.access_token;
  let tokenRequests = 0;
  await page.route(/https:\/\/[^/]*\.supabase\.co\/.*/, async (route) => { unexpectedNetwork.push(route.request().url()); await route.abort(); });
  if (options.rotatingToken) await page.route("http://localhost:3001/api/auth/supabase/token**", async (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: { ...headers, "Access-Control-Allow-Headers": "authorization,content-type,apikey,x-client-info,x-supabase-api-version", "Access-Control-Allow-Methods": "POST,OPTIONS" } });
    tokenRequests += 1;
    currentToken = tokenRequests === 1 ? session.access_token : `${session.access_token.split(".").slice(0, 2).join(".")}.second-fixture-signature`;
    return route.fulfill({ headers, json: { ...session, access_token: currentToken } });
  });
  if (options.secondBusiness || options.authorizedEmployee || options.revokedSecondBusiness) {
    await page.route("http://localhost:3001/api/business-management/context**", async (route) => {
      if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers });
      const url = new URL(route.request().url());
      const second = url.searchParams.get("businessId") === secondBusinessId;
      const denied = options.revokedSecondBusiness && second;
      const branchId = second ? secondBranchId : url.searchParams.get("branchId") ?? business.branchId;
      return route.fulfill({ headers, json: {
        business: second ? { ...business, id: secondBusinessId, name: "İkinci test işletmesi" } : business,
        businesses: [{ id: business.id, name: business.name }, { id: secondBusinessId, name: "İkinci test işletmesi" }],
        branch: { id: branchId, name: second ? "Diğer merkez" : branchId === business.branchId ? "Merkez" : "İkinci şube" },
        branches: second ? [{ id: secondBranchId, name: "Diğer merkez" }] : [{ id: business.branchId, name: "Merkez" }, { id: appointmentId, name: "İkinci şube" }],
        role: denied || options.authorizedEmployee ? "EMPLOYEE" : "OWNER",
        permissions: { calendar: true, customers: true, campaigns: !denied, inventory: !denied, reports: !denied, operations: !denied },
        financialVisibility: !denied, customerVisibility: options.authorizedEmployee ? "assigned" : "all", person: "Test Yönetici",
      } });
    });
  }
  await page.route(`http://localhost:3001${endpoint}**`, async (route: Route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    if (request.method() !== "GET") { writes.push(request.url()); return route.fulfill({ status: 405, headers, json: { error: "Reports are read-only." } }); }
    const url = new URL(request.url());
    reads.push({ url, authorization: request.headers().authorization, expectedAuthorization: `Bearer ${currentToken}` });
    if (options.pendingFirst && reads.length === 1) await options.pendingFirst;
    if (options.firstFailure && reads.length === 1) return route.fulfill({ status: 503, headers, json: { error: "Rapor servisi şu anda kullanılamıyor." } });
    const data = payload(url, options);
    if (options.rotatingToken && tokenRequests > 1) {
      data.summary.current.total += 1;
      data.daily[0].total += 1;
      data.breakdown.rows[0].total += 1;
      data.breakdown.rows[0].label = "Yeni oturum raporu";
    }
    expect(businessReportSchema.safeParse(data).success, "Controlled report fixture matches the shared strict contract before intentional corruption").toBe(true);
    if (options.invalid === "amount") data.summary.current.values[0].minor = "9007199254740993.1";
    if (options.invalid === "scope") data.scope.businessId = secondBusinessId;
    if (options.invalid === "series") data.daily.pop();
    if (options.invalid === "minutes") data.daily[0].bookedMinutes += 1;
    return route.fulfill({ headers, json: data });
  });
  const state = { reads, writes, otherWrites, unexpectedNetwork };
  safety.set(page, state);
  return state;
}

async function openReports(page: Page, options: ReportOptions = {}) {
  const state = await reportApi(page, options);
  await signIn(page);
  await page.goto("/manage/reports");
  return state;
}

test.afterEach(async ({ page }) => {
  const state = safety.get(page);
  if (!state) return;
  expect(state.writes, "No report mutation endpoint").toEqual([]);
  expect(state.otherWrites, "No appointment, customer, payment, campaign or raw-table writes").toEqual([]);
  expect(state.unexpectedNetwork, "No real Supabase authentication/data requests").toEqual([]);
  expect(state.reads.every(({ authorization, expectedAuthorization }) => authorization === expectedAuthorization), "Every report uses the fixture's current bearer token").toBe(true);
  expect(state.reads.every(({ url }) => businessReportQuery.safeParse(Object.fromEntries(url.searchParams)).success), "Every query is bounded and explicit").toBe(true);
  expect(state.reads.every(({ url }) => url.searchParams.get("businessId") === secondBusinessId
    ? url.searchParams.get("branchId") === secondBranchId
    : url.searchParams.get("businessId") === business.id && [business.branchId, appointmentId].includes(url.searchParams.get("branchId") ?? "")), "No cross-business branch request").toBe(true);
});

test("report period controls request complete 7/30/90 day comparisons with explicit tenant scope", async ({ page, context }) => {
  const { reads } = await openReports(page);
  await expect(page.getByTestId("business-report-summary")).toBeVisible();
  expect(reads[0].url.searchParams.get("days")).toBe("30");
  for (const days of [7, 90, 30]) {
    await page.getByRole("button", { name: `${days} gün`, exact: true }).click();
    await expect.poll(() => reads.some(({ url }) => url.searchParams.get("days") === String(days))).toBe(true);
    await expect(page.getByTestId("business-report-summary")).toBeVisible();
  }
  expect(reads.every(({ url }) => url.searchParams.get("businessId") === business.id && url.searchParams.get("branchId") === business.branchId && url.searchParams.get("allBranches") === "false")).toBe(true);
  expect(context.pages()).toHaveLength(1);
});

test("all-branches filter resets report pages without changing the authenticated business", async ({ page }) => {
  const { reads } = await openReports(page, { paginated: true });
  await expect(page.getByTestId("business-report-summary")).toBeVisible();
  await page.getByRole("button", { name: "Tüm şubeler", exact: true }).click();
  await expect.poll(() => reads.some(({ url }) => url.searchParams.get("allBranches") === "true")).toBe(true);
  expect(reads.filter(({ url }) => url.searchParams.get("allBranches") === "true").every(({ url }) => url.searchParams.get("businessId") === business.id && url.searchParams.get("branchId") === business.branchId && url.searchParams.get("offset") === "0")).toBe(true);
  await expect(page.getByTestId("business-report-summary")).toBeVisible();
});

test("summary uses all records while service, employee and branch breakdowns page independently", async ({ page }) => {
  const { reads } = await openReports(page, { paginated: true });
  const summary = page.getByTestId("business-report-summary");
  await expect(summary.getByText("120", { exact: true })).toBeVisible();
  for (const [dimension, label, more, last] of [
    ["service", "Hizmetler", "Daha fazla hizmet", "Son hizmet"],
    ["employee", "Uzmanlar", "Daha fazla uzman", "Son uzman"],
    ["branch", "Şubeler", "Daha fazla şube", "Son şube"],
  ]) {
    await page.getByRole("button", { name: label, exact: true }).click();
    await expect(page.getByRole("button", { name: more, exact: true })).toBeVisible();
    expect(reads.some(({ url }) => url.searchParams.get("dimension") === dimension && url.searchParams.get("offset") === "25")).toBe(false);
    await page.getByRole("button", { name: more, exact: true }).click();
    await expect(page.getByText(last, { exact: true })).toBeVisible();
    expect(reads.some(({ url }) => url.searchParams.get("dimension") === dimension && url.searchParams.get("offset") === "25")).toBe(true);
    await expect(summary.getByText("120", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: more, exact: true })).toHaveCount(0);
  }
});

test("a changed aggregate between pages cannot be displayed as one apparently complete breakdown", async ({ page }) => {
  await openReports(page, { paginated: true, changedPage: true });
  await expect(page.getByTestId("business-report-summary").getByText("120", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Daha fazla hizmet", exact: true }).click();
  await expect(page.getByText("Rapor kayıtları yükleme sırasında değişti. Sayfaları birlikte göstermek için raporu yeniden yükle.", { exact: true })).toBeVisible();
  await expect(page.getByText("Son hizmet", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Değişen raporu yeniden yükle", exact: true })).toBeVisible();
});

test("planned utilization is a separate future window with out-of-plan warnings, not historical occupancy", async ({ page }) => {
  await openReports(page);
  await expect(page.getByText("Gelecek 7 gün planlanan doluluk", { exact: true })).toBeVisible();
  await expect(page.getByText("25%", { exact: true })).toBeVisible();
  await expect(page.getByText("250 dk dolu / 1.000 dk kullanılabilir uzman süresi", { exact: true })).toBeVisible();
  await expect(page.getByText(/^Plan dışı randevu uyarısı: Seçili rapor kapsamındaki 120 dk/)).toBeVisible();
  await expect(page.getByText(/Bugün hariç gelecek 7 tam günün planıdır, geçmiş doluluk/)).toBeVisible();
});

test("completed appointment values remain exact and separate by currency, never presented as collected payments", async ({ page }) => {
  await openReports(page, { mixedCurrencies: true, unsafeInteger: true });
  const summary = page.getByTestId("business-report-summary");
  const content = page.getByTestId("business-report-content");
  await expect(summary).toBeVisible();
  await expect(page.getByText(/^Tahsil edilmiş ödeme değildir\./)).toBeVisible();
  await expect(content.getByText("90.071.992.547.409,93 TRY", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "USD", exact: true }).click();
  await expect(content.getByText("50,50 USD", { exact: true })).toBeVisible();
  await expect(page.getByText(/Tutar hizmetlere paylaştırılmaz/)).toBeVisible();
  await expect(page.getByText(/NaN|Infinity/)).toHaveCount(0);
});

test("an empty accepted report is distinguishable from failure and zero comparison does not fabricate a percentage", async ({ page }) => {
  await openReports(page, { empty: true, noCapacity: true });
  await expect(page.getByTestId("business-report-summary")).toBeVisible();
  await expect(page.getByText("Önceki dönem sıfır; yüzde değişim hesaplanamaz.", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/NaN|Infinity|%100 artış/)).toHaveCount(0);
  await expect(page.getByText("Rapor alınamadı", { exact: true })).toHaveCount(0);
});

test("loading a report shows no fake zero summary before the real response", async ({ page }) => {
  const gate = deferred();
  await openReports(page, { pendingFirst: gate.promise });
  try {
    await expect(page.getByText("Rapor hazırlanıyor...", { exact: true })).toBeVisible();
    await expect(page.getByTestId("business-report-summary")).toHaveCount(0);
  } finally { gate.resolve(); }
  await expect(page.getByTestId("business-report-summary")).toBeVisible();
});

test("unavailable report service shows a retryable error rather than success with zero totals", async ({ page }) => {
  const { reads } = await openReports(page, { firstFailure: true });
  await expect(page.getByText("Rapor alınamadı", { exact: true })).toBeVisible();
  await expect(page.getByText("Rapor servisi şu anda kullanılamıyor.", { exact: true })).toBeVisible();
  await expect(page.getByTestId("business-report-summary")).toHaveCount(0);
  expect(reads).toHaveLength(1);
  await page.getByRole("button", { name: "Raporu yeniden yükle", exact: true }).click();
  await expect(page.getByTestId("business-report-summary")).toBeVisible();
  expect(reads).toHaveLength(2);
});

for (const invalid of ["amount", "scope", "series", "minutes"] as const) test(`invalid ${invalid} report response fails closed instead of displaying misleading data`, async ({ page }) => {
  await openReports(page, { invalid });
  await expect(page.getByText("Rapor alınamadı", { exact: true })).toBeVisible();
  await expect(page.getByTestId("business-report-summary")).toHaveCount(0);
});

test("a late response from the previous branch cannot replace the new branch report", async ({ page }) => {
  const gate = deferred();
  const { reads } = await openReports(page, { pendingFirst: gate.promise });
  try {
    await expect(page.getByText("Rapor hazırlanıyor...", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "İşletme menüsünü aç", exact: true }).click();
    await page.getByText("İkinci şube", { exact: true }).click();
    await expect(page.getByText("İkinci şube raporu", { exact: true })).toBeVisible();
  } finally { gate.resolve(); }
  await expect.poll(() => reads.some(({ url }) => url.searchParams.get("branchId") === appointmentId)).toBe(true);
  await expect(page.getByText("Saç kesimi", { exact: true })).toHaveCount(0);
  await expect(page.getByText("İkinci şube raporu", { exact: true })).toBeVisible();
});

test("business switching clears old report data and scopes all subsequent requests", async ({ page }) => {
  const { reads } = await openReports(page, { secondBusiness: true });
  await expect(page.getByText("Saç kesimi", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "İşletme menüsünü aç", exact: true }).click();
  await page.getByText("İkinci test işletmesi", { exact: true }).click();
  await expect(page.getByText("Yeni işletme raporu", { exact: true })).toBeVisible();
  await expect(page.getByText("Saç kesimi", { exact: true })).toHaveCount(0);
  expect(reads.filter(({ url }) => url.searchParams.get("businessId") === secondBusinessId).every(({ url }) => url.searchParams.get("branchId") === secondBranchId)).toBe(true);
});

test("a business without report permission cannot retain a previous business's financial summary", async ({ page }) => {
  const { reads } = await openReports(page, { revokedSecondBusiness: true });
  await expect(page.getByTestId("business-report-summary")).toBeVisible();
  await page.getByRole("button", { name: "İşletme menüsünü aç", exact: true }).click();
  await page.getByText("İkinci test işletmesi", { exact: true }).click();
  await expect(page.getByText("Bölüm açılamadı", { exact: true })).toBeVisible();
  await expect(page.getByTestId("business-report-summary")).toHaveCount(0);
  expect(reads.some(({ url }) => url.searchParams.get("businessId") === secondBusinessId)).toBe(false);
});

test("signing out and back into the same account cannot reuse an old token's report", async ({ page }) => {
  const { reads } = await openReports(page, { rotatingToken: true });
  await expect(page.getByTestId("business-report-summary").getByText("120", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "İşletme menüsünü aç", exact: true }).click();
  await page.getByText("Müşteri görünümüne dön", { exact: true }).click();
  await page.getByRole("button", { name: "Oturumu kapat", exact: true }).click();
  await expect(page.getByRole("button", { name: "Giriş yap veya kayıt ol", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Giriş yap veya kayıt ol", exact: true }).click();
  await page.getByLabel("E-posta", { exact: true }).fill("customer@example.com");
  await page.getByLabel("Şifre", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Giriş yap", exact: true }).click();
  await expect(page).toHaveURL("http://localhost:8082/profile");
  await page.getByRole("button", { name: /İşletme paneli/ }).click();
  await page.getByRole("button", { name: "İşletme menüsünü aç", exact: true }).click();
  await page.getByRole("button", { name: "Raporlar", exact: true }).click();
  await expect(page.getByText("Yeni oturum raporu", { exact: true })).toBeVisible();
  await expect(page.getByTestId("business-report-summary").getByText("121", { exact: true })).toBeVisible();
  await expect(page.getByText("Saç kesimi", { exact: true })).toHaveCount(0);
  expect(reads).toHaveLength(2);
  expect(reads[0].authorization).not.toBe(reads[1].authorization);
});

test("ordinary employees cannot request reports while explicitly permitted staff see only their own scope", async ({ page }) => {
  const denied = await openReports(page, { employee: true });
  await expect(page.getByText("Bölüm açılamadı", { exact: true })).toBeVisible();
  expect(denied.reads).toHaveLength(0);
});

test("staff with both report and financial permission get an employee-scoped report", async ({ page }) => {
  const { reads } = await openReports(page, { authorizedEmployee: true });
  await expect(page.getByTestId("business-report-summary")).toBeVisible();
  expect(reads).toHaveLength(1);
  expect(payload(reads[0].url, { authorizedEmployee: true }).scope.employeeId).toBe(business.employees[0].id);
  await expect(page.getByText(/yalnızca.*randevu|kendi.*randevu/i)).toBeVisible();
});

test("native report chart is accessible, typography is restrained and all cards fit a narrow phone", async ({ page }) => {
  const { reads } = await openReports(page);
  const content = page.getByTestId("business-report-content");
  await expect(content).toBeVisible();
  await expect(page.getByLabel("Günlük randevu grafiği", { exact: true })).toBeVisible();
  const report = payload(reads[0].url, {});
  await expect(page.getByLabel(new RegExp(`120 randevu`)).first()).toBeVisible();
  expect(report.daily).toHaveLength(30);
  await expect(content.getByText("Raporlar", { exact: true })).toHaveCSS("font-weight", "600");
  await expect(content.getByText("Raporlar", { exact: true })).toHaveCSS("color", "rgb(48, 49, 59)");
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    for (const id of ["business-report-summary", "business-report-chart", "business-report-breakdown"]) {
      const box = await page.getByTestId(id).boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    }
    const overflow = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
    expect(overflow.scroll).toBeLessThanOrEqual(overflow.width);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await content.getByText("Raporlar", { exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: "artifacts/mobile-native-business-reports.jpg", type: "jpeg", quality: 95, fullPage: true });
  await page.getByTestId("business-report-chart").scrollIntoViewIfNeeded();
  await page.screenshot({ path: "artifacts/mobile-native-business-reports-chart.jpg", type: "jpeg", quality: 95, fullPage: true });
});
