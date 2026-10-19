import { expect, test } from "@playwright/test";
import { mockApi, signIn } from "./fixtures";

test("mobile login bootstraps public configuration, persists a session and signs out", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await mockApi(page);
  await signIn(page);
  await expect(page.getByTestId("notification-badge")).toHaveText("1");
  const profileReads = () => ["/api/session-summary", "/api/notifications"].map((path) => page.waitForResponse((response) => new URL(response.url()).pathname === path && response.request().method() === "GET" && response.status() === 200));
  const opened = profileReads();
  await page.goto("/profile");
  for (const response of opened) expect(await (await response).finished()).toBeNull();
  await expect(page.getByText("Test Müşteri", { exact: true })).toBeVisible();
  await expect(page.getByText("İzmir", { exact: true })).toBeVisible();
  // Persistence is tested after the profile is ready, not while aborting its initial reads.
  const reloaded = profileReads();
  await page.reload();
  for (const response of reloaded) expect(await (await response).finished()).toBeNull();
  await expect(page.getByText("Test Müşteri", { exact: true })).toBeVisible();
  await expect(page.getByText("İzmir", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Oturumu kapat" }).click();
  await expect(page.getByRole("button", { name: "Giriş yap veya kayıt ol" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("wrong password gives a clear error and keeps the form usable", async ({ page }) => {
  await mockApi(page, { loginError: true });
  await page.goto("/auth");
  await page.getByLabel("E-posta", { exact: true }).fill("customer@example.com");
  await page.getByLabel("Şifre", { exact: true }).fill("123456");
  await page.getByRole("button", { name: "Giriş yap", exact: true }).click();
  await expect(page.getByText("E-posta veya şifre hatalı.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Giriş yap", exact: true })).toBeEnabled();
});

test("offline authentication does not masquerade as a wrong password", async ({ page }) => {
  await mockApi(page, { offline: true });
  await page.goto("/auth");
  await page.getByLabel("E-posta", { exact: true }).fill("customer@example.com");
  await page.getByLabel("Şifre", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Giriş yap", exact: true }).click();
  await expect(page.getByText("Giriş servisine ulaşılamadı. Biraz sonra yeniden dene.")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Giriş yap", exact: true })).toBeEnabled();
});
