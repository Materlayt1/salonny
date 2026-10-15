import { expect, test } from "@playwright/test";
import type { NotificationItem } from "@salonny/contracts";
import { appointmentId, business, businessId, mockApi, signIn } from "./fixtures";

const notice = (extra: Partial<NotificationItem> = {}): NotificationItem => ({ id: appointmentId, type: "appointment_confirmed", title: "Randevunuz onaylandı", body: "Saç kesimi randevunuz oluşturuldu.", readAt: null, createdAt: new Date().toISOString(), appointmentId, businessId, branchId: business.branchId, ...extra });

for (const type of ["appointment_confirmed", "appointment_status_changed", "appointment_cancelled", "appointment_rescheduled"]) {
  test(`${type} opens the regular appointments tab, independently of the read receipt`, async ({ page }) => {
    const writes = await mockApi(page, { notifications: [notice({ type })] });
    await signIn(page); await page.goto("/notifications");
    await page.getByRole("button", { name: "Randevunuz onaylandı, okunmadı", exact: true }).click();
    await expect(page).toHaveURL(/\/appointments$/);
    await expect(page.getByText("Randevularım", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: `${business.name} randevusunu yönet` })).toBeVisible();
    await expect.poll(() => writes.filter((write) => write.path === "/api/notifications").length).toBe(1);
    expect(writes.find((write) => write.path === "/api/notifications")?.body).toEqual({ ids: [appointmentId] });
    expect(writes.find((write) => write.path === "/api/notifications")?.authorization).toMatch(/^Bearer /);
  });
}
test("already-read notifications still open without another write", async ({ page }) => {
  const writes = await mockApi(page, { notifications: [notice({ readAt: new Date().toISOString() })] });
  await signIn(page); await page.goto("/notifications");
  await page.getByRole("button", { name: "Randevunuz onaylandı", exact: true }).click();
  await expect(page).toHaveURL(/\/appointments$/);
  await expect(page.getByText("Randevularım", { exact: true })).toBeVisible();
  expect(writes).toHaveLength(0);
});
test("failed read receipts cannot block appointment navigation or cause modal alerts", async ({ page }) => {
  const dialogs: string[] = []; page.on("dialog", async (dialog) => { dialogs.push(dialog.message()); await dialog.dismiss(); });
  const writes = await mockApi(page, { notifications: [notice()], notificationReadFailure: true });
  await signIn(page); await page.goto("/notifications");
  await page.getByRole("button", { name: "Randevunuz onaylandı, okunmadı" }).click();
  await expect(page).toHaveURL(/\/appointments$/);
  await expect(page.getByText("Randevularım", { exact: true })).toBeVisible();
  await expect.poll(() => writes.length).toBe(1); expect(dialogs).toEqual([]);
});
test("old notices without a relationship open the appointments list", async ({ page }) => {
  await mockApi(page, { notifications: [notice({ type: undefined, appointmentId: undefined, businessId: undefined, branchId: undefined })] });
  await signIn(page); await page.goto("/notifications"); await page.getByRole("button", { name: "Randevunuz onaylandı, okunmadı" }).click();
  await expect(page).toHaveURL(/\/appointments$/); await expect(page.getByText("Randevularım", { exact: true })).toBeVisible();
});
test("stale appointment references still open the regular list without a missing-detail screen", async ({ page }) => {
  const missingId = "10000000-0000-4000-8000-000000000099";
  await mockApi(page, { notifications: [notice({ appointmentId: missingId })] });
  await signIn(page); await page.goto("/notifications"); await page.getByRole("button", { name: "Randevunuz onaylandı, okunmadı" }).click();
  await expect(page).toHaveURL(/\/appointments$/); await expect(page.getByText("Randevularım", { exact: true })).toBeVisible();
  await expect(page.getByText("Randevu bulunamadı", { exact: true })).toHaveCount(0);
});
for (const type of ["new_appointment", "appointment_cancelled_by_customer", "appointment_rescheduled_by_customer"]) {
  test(`${type} opens the full staff appointment list with explicit business and branch scope`, async ({ page }) => {
    const requests: string[] = [];
    page.on("request", (req) => { if (new URL(req.url()).pathname === "/api/business-management/appointments") requests.push(req.url()); });
    await mockApi(page, { businessAccount: true, notifications: [notice({ type })] });
    await signIn(page); await page.goto("/notifications"); await page.getByRole("button", { name: "Randevunuz onaylandı, okunmadı" }).click();
    await expect(page).toHaveURL(/\/manage\/appointments\?/);
    await expect(page.getByText("Randevular", { exact: true })).toBeVisible();
    await expect(page.getByText("Bildirimdeki randevu", { exact: true })).toHaveCount(0);
    await expect.poll(() => requests.length).toBeGreaterThan(0);
    const params = new URL(requests.at(-1)!).searchParams;
    expect(params.get("businessId")).toBe(businessId); expect(params.get("branchId")).toBe(business.branchId); expect(params.has("appointmentId")).toBe(false);
  });
}
test("campaign notices stay native and open the related business", async ({ page }) => {
  const writes = await mockApi(page, { notifications: [notice({ type: "campaign", appointmentId: null, businessSlug: business.slug, title: "Yeni indirim" })] });
  await signIn(page); await page.goto("/notifications"); await page.getByRole("button", { name: "Yeni indirim, okunmadı" }).click();
  await expect(page).toHaveURL(new RegExp(`/business/${business.slug}$`)); await expect(page.getByRole("button", { name: "Randevu al", exact: true }).first()).toBeVisible();
  expect(writes.every((write) => write.path === "/api/notifications")).toBe(true);
});

for (const branchId of ["10000000-0000-4000-8000-000000000088", null]) {
  test(`a retained management stack switches to the notification business, branch=${branchId}`, async ({ page }) => {
    const secondBusinessId = "10000000-0000-4000-8000-000000000077";
    const secondBranchId = "10000000-0000-4000-8000-000000000088";
    const requests: string[] = [];
    await mockApi(page, { businessAccount: true, notifications: [notice({ type: "new_appointment", businessId: secondBusinessId, branchId })] });
    await page.route("http://localhost:3001/api/business-management/context?**", async (route) => {
      const headers = { "Access-Control-Allow-Origin": "http://localhost:8082", "Access-Control-Allow-Headers": "authorization,content-type", "Access-Control-Allow-Methods": "GET,OPTIONS" };
      if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers });
      const second = new URL(route.request().url()).searchParams.get("businessId") === secondBusinessId;
      const selected = second ? { ...business, id: secondBusinessId, name: "İkinci test işletmesi" } : business;
      const selectedBranch = { id: second ? secondBranchId : business.branchId, name: second ? "İkinci merkez" : "Merkez" };
      return route.fulfill({ headers, json: { business: selected, businesses: [business, { id: secondBusinessId, name: "İkinci test işletmesi" }], branch: selectedBranch, branches: [selectedBranch], role: "OWNER", permissions: { calendar: true, customers: true, campaigns: true, inventory: true, reports: true, operations: true }, financialVisibility: true, customerVisibility: "all", person: "Test yönetici" } });
    });
    page.on("request", (req) => { if (new URL(req.url()).pathname === "/api/business-management/appointments") requests.push(req.url()); });
    await signIn(page); await page.goto(`/manage/appointments?businessId=${businessId}&branchId=${business.branchId}`);
    await page.getByRole("button", { name: "Bildirimler", exact: true }).click();
    await page.getByRole("button", { name: "Randevunuz onaylandı, okunmadı" }).click();
    await expect(page.getByText("İkinci test işletmesi", { exact: true })).toBeVisible();
    await expect.poll(() => requests.some((url) => new URL(url).searchParams.get("businessId") === secondBusinessId)).toBe(true);
    const params = new URL(requests.at(-1)!).searchParams;
    expect(params.get("businessId")).toBe(secondBusinessId); expect(params.get("branchId")).toBe(secondBranchId); expect(params.has("appointmentId")).toBe(false);
  });
}

test("new review notices open the native review list, including moderation status", async ({ page }) => {
  const writes = await mockApi(page, { businessAccount: true, notifications: [notice({ type: "new_review", title: "Yeni doğrulanmış değerlendirme" })] });
  await signIn(page); await page.goto("/notifications");
  await expect(page.getByText("Değerlendirmelere git", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Yeni doğrulanmış değerlendirme, okunmadı" }).click();
  await expect(page).toHaveURL(/\/manage\/reviews\?/);
  await expect(page.getByText("Değerlendirmeler", { exact: true })).toBeVisible();
  await expect(page.getByText("Kontrollü müşteri değerlendirmesi", { exact: true })).toBeVisible();
  await expect(page.getByText("İncelemede", { exact: true })).toBeVisible();
  expect(writes.every((write) => write.path === "/api/notifications")).toBe(true);
});

test("long notification content stays inside the mobile viewport", async ({ page }) => {
  await mockApi(page, { notifications: [notice({ title: "Randevunuzun yeni tarihi ve saati işletme tarafından güncellendi", body: "Uzun bildirim açıklaması. ".repeat(16) })] });
  await signIn(page); await page.goto("/notifications");
  await expect(page.getByText("Randevularıma git", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("notification list and regular appointments tab have a readable mobile layout", async ({ page }, testInfo) => {
  await mockApi(page, { notifications: [notice(), notice({ id: business.branchId, type: "new_review", title: "Yeni doğrulanmış değerlendirme", body: "5 yıldızlı bir değerlendirme aldınız.", readAt: new Date().toISOString() }), notice({ id: businessId, type: "campaign", title: "İşletmenden yeni kampanya", body: "Güncel fırsatları inceleyebilirsin.", businessSlug: business.slug, appointmentId: null })] });
  await signIn(page); await page.goto("/notifications");
  const card = page.getByRole("button", { name: "Randevunuz onaylandı, okunmadı", exact: true });
  await expect(card).toBeVisible();
  const box = await card.boundingBox();
  expect(box?.x).toBeGreaterThanOrEqual(16); expect(box?.width).toBeLessThanOrEqual(358);
  await page.screenshot({ path: testInfo.outputPath("notifications.png"), fullPage: true });
  await card.click(); await expect(page).toHaveURL(/\/appointments$/);
  await expect(page.getByRole("button", { name: `${business.name} randevusunu yönet` })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("appointments.png"), fullPage: true });
});
