import { expect, test } from "@playwright/test";
import { mockApi, signIn, business } from "./fixtures";
test.use({ deviceScaleFactor: 1, viewport: { width: 390, height: 844 } });

test("native staff skills update one scoped link and remain in the app", async ({ page, context }) => {
  const writes = await mockApi(page, { businessAccount: true }); await signIn(page); await page.goto("/manage/employees");
  await page.getByRole("button", { name: "Hizmetler ve müsaitlik", exact: true }).click();
  await expect(page.getByLabel("Saç kesimi yetkinliği")).toBeChecked();
  // Controlled switches reflect server-confirmed state, not a synchronous checkbox toggle.
  await page.getByLabel("Saç kesimi yetkinliği").click();
  await expect(page.getByLabel("Saç kesimi yetkinliği")).not.toBeChecked();
  const write = writes.find((item) => item.path === "/api/business-management/team")!;
  expect(write.body).toMatchObject({ action: "service", employeeId: business.employees[0].id, serviceId: business.services[0].id, assigned: false });
  expect(write.authorization).toMatch(/^Bearer /);
  expect(new URL(write.url).searchParams.get("branchId")).toBe(business.branchId);
  expect(context.pages()).toHaveLength(1);
  await page.getByRole("button", { name: "Çalışan araçlarını kapat" }).click();
  await expect(page.getByLabel("Saç kesimi yetkinliği")).toHaveCount(0);
});
test("weekly editor validates clock values before submitting branch-specific periods", async ({ page }) => {
  const writes = await mockApi(page, { businessAccount: true }); await signIn(page); await page.goto("/manage/employees");
  await page.getByRole("button", { name: "Hizmetler ve müsaitlik" }).click();
  await page.getByRole("button", { name: "Çalışan vardiya", exact: true }).click();
  // Both time fields must fit even on narrow phones, not merely be clickable.
  await page.setViewportSize({ width: 320, height: 844 });
  const startBox = await page.getByLabel("Pazartesi başlangıç", { exact: true }).boundingBox();
  const endBox = await page.getByLabel("Pazartesi bitiş", { exact: true }).boundingBox();
  expect(startBox!.x).toBeGreaterThanOrEqual(20);
  expect(endBox!.x + endBox!.width).toBeLessThanOrEqual(300);
  expect(startBox!.y).toBe(endBox!.y);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel("Pazartesi bitiş", { exact: true }).fill("08:00");
  await page.getByRole("button", { name: "Vardiyayı kaydet" }).click();
  await expect(page.getByText(/Saatleri SS:DD/)).toBeVisible(); expect(writes).toHaveLength(0);
  await page.getByLabel("Pazartesi bitiş", { exact: true }).fill("16:30");
  await page.getByRole("button", { name: "Vardiyayı kaydet" }).click();
  await expect(page.getByText("Kaydedildi.", { exact: true })).toBeVisible();
  expect(writes[0].body).toMatchObject({ action: "schedule", employeeId: business.employees[0].id, periods: [{ weekday: 0, startsAt: "09:00", endsAt: "16:30" }] });
  await page.getByText(/Saatler İstanbul saatidir. Vardiya seçili şubeye aittir/).scrollIntoViewIfNeeded();
  await page.screenshot({ path: "artifacts/mobile-native-team.jpg", type: "jpeg", quality: 95 });
});
test("time off uses Istanbul input, appears in the list and requires removal confirmation", async ({ page }) => {
  const writes = await mockApi(page, { businessAccount: true }); await signIn(page); await page.goto("/manage/employees");
  await page.getByRole("button", { name: "Hizmetler ve müsaitlik" }).click();
  await page.getByRole("button", { name: "Çalışan izinler", exact: true }).click();
  await page.getByLabel("İzin başlangıcı").fill("2026-10-10 09:00");
  await page.getByLabel("İzin bitişi").fill("2026-10-10 18:00");
  await page.getByLabel("İzin notu").fill("Test izin kaydı");
  await page.getByRole("button", { name: "İzni kaydet" }).click();
  await expect(page.getByLabel("İzin notu")).toHaveValue("");
  await expect(page.getByText("Test izin kaydı", { exact: true })).toBeVisible();
  expect(writes[0].body).toMatchObject({ action: "timeOff", startsAt: "2026-10-10T06:00:00.000Z", endsAt: "2026-10-10T15:00:00.000Z" });
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "İzin kaydını kaldır" }).click();
  expect(writes).toHaveLength(1);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "İzin kaydını kaldır" }).click();
  await expect(page.getByText("Test izin kaydı", { exact: true })).toHaveCount(0);
  expect(writes[1].body).toMatchObject({ action: "removeTimeOff", employeeId: business.employees[0].id });
});
test("ordinary employees cannot open management-only availability tools", async ({ page }) => {
  await mockApi(page, { businessAccount: true, employee: true }); await signIn(page); await page.goto("/manage/employees");
  await expect(page.getByText("Test uzmanı", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Hizmetler ve müsaitlik" })).toHaveCount(0);
});
test("advanced schedules cannot be accidentally overwritten by the simple weekly editor", async ({ page }) => {
  const writes = await mockApi(page, { businessAccount: true, advancedSchedule: true }); await signIn(page); await page.goto("/manage/employees");
  await page.getByRole("button", { name: "Hizmetler ve müsaitlik" }).click();
  await page.getByRole("button", { name: "Çalışan vardiya", exact: true }).click();
  await expect(page.getByText(/Tarihe özel veya çok parçalı vardiyalar var/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Vardiyayı kaydet" })).toBeDisabled();
  expect(writes).toHaveLength(0);
});
test("failed skill writes do not pretend to save or leave the form blocked", async ({ page }) => {
  await mockApi(page, { businessAccount: true, teamWriteFailure: true }); await signIn(page); await page.goto("/manage/employees");
  await page.getByRole("button", { name: "Hizmetler ve müsaitlik" }).click();
  await page.getByLabel("Saç kesimi yetkinliği").click();
  await expect(page.getByText("Çalışan planı kaydedilemedi. Yeniden dene.", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Saç kesimi yetkinliği")).toBeChecked();
  await expect(page.getByLabel("Saç kesimi yetkinliği")).toBeEnabled();
});
