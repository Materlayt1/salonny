import { expect, test } from "@playwright/test";
import { mockApi } from "./fixtures";

test("authentication labels persist and keyboard next/submit preserve the real login flow", async ({ page }) => {
  await mockApi(page);
  const tokenRequests: unknown[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.endsWith("/token") && request.method() === "POST") tokenRequests.push(request.postDataJSON());
  });
  await page.goto("/auth");
  await page.getByLabel("E-posta", { exact: true }).fill("customer@example.com");
  await expect(page.getByText("E-posta", { exact: true })).toBeVisible();
  await page.getByLabel("E-posta", { exact: true }).press("Enter");
  await expect(page.getByLabel("Şifre", { exact: true })).toBeFocused();
  await page.getByLabel("Şifre", { exact: true }).fill("test-password");
  await expect(page.getByText("Şifre", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Şifreyi göster", exact: true }).click();
  await expect(page.getByLabel("Şifre", { exact: true })).toHaveJSProperty("type", "text");
  await page.getByRole("button", { name: "Şifreyi gizle", exact: true }).click();
  await expect(page.getByLabel("Şifre", { exact: true })).toHaveAttribute("type", "password");
  await page.getByLabel("Şifre", { exact: true }).press("Enter");
  await page.waitForURL("http://localhost:8082/");
  expect(tokenRequests).toHaveLength(1);
  expect(tokenRequests[0]).toMatchObject({ email: "customer@example.com", password: "test-password" });
});

test("invalid login highlights individual fields and focuses the first one without submitting", async ({ page }) => {
  await mockApi(page);
  const authRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/auth/supabase/") && request.method() === "POST") authRequests.push(request.url());
  });
  await page.goto("/auth");
  await page.getByRole("button", { name: "Giriş yap", exact: true }).click();
  await expect(page.getByText("E-posta adresini gir.", { exact: true })).toBeVisible();
  await expect(page.getByText("Şifreni gir.", { exact: true })).toBeVisible();
  await expect(page.getByLabel("E-posta", { exact: true })).toBeFocused();
  await page.getByLabel("E-posta", { exact: true }).fill("yanlis@");
  await page.getByRole("button", { name: "Şifremi unuttum", exact: true }).click();
  await expect(page.getByText("Geçerli bir e-posta adresi gir. Örnek: ad@ornek.com", { exact: true })).toBeVisible();
  await expect(page.getByLabel("E-posta", { exact: true })).toBeFocused();
  expect(authRequests).toHaveLength(0);
});

test("ordinary auth blur still validates and email actions preserve keyboard and pointer activation", async ({ page }) => {
  const writes = await mockApi(page);
  await page.goto("/auth");
  const email = page.getByLabel("E-posta", { exact: true });
  await email.fill("yanlis@");
  await email.press("Tab");
  await expect(page.getByText("Geçerli bir e-posta adresi gir. Örnek: ad@ornek.com", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Şifre", { exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Doğrulama e-postasını yeniden gönder", exact: true }).press("Enter");
  await expect(email).toBeFocused();
  expect(writes.filter((request) => request.path.startsWith("/api/auth/supabase/"))).toHaveLength(0);

  await email.fill("customer@example.com");
  await page.getByRole("button", { name: "Şifremi unuttum", exact: true }).click();
  await expect(page.getByText(/E-posta adresine gönderilen bağlantıdan şifreni yenileyebilirsin/)).toBeVisible();
  const recoverRequests = writes.filter((request) => request.path === "/api/auth/supabase/recover");
  expect(recoverRequests).toHaveLength(1);
  expect(recoverRequests[0].body).toMatchObject({ email: "customer@example.com" });
  await page.getByRole("button", { name: "Doğrulama e-postasını yeniden gönder", exact: true }).press("Enter");
  await expect(page.getByText(/Doğrulama e-postası yeniden gönderildi/)).toBeVisible();
  const resendRequests = writes.filter((request) => request.path === "/api/auth/supabase/resend");
  expect(resendRequests).toHaveLength(1);
  expect(resendRequests[0].body).toMatchObject({ type: "signup", email: "customer@example.com" });
});

test("signup keeps password guidance and places validation beside the failing field", async ({ page }) => {
  await mockApi(page);
  const tokenRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.endsWith("/token") && request.method() === "POST") tokenRequests.push(request.url());
  });
  await page.goto("/auth");
  await page.getByRole("tab", { name: "Kayıt ol", exact: true }).click();
  await expect(page.getByText(/En az 8 karakter kullan/)).toBeVisible();
  await page.getByLabel("Ad soyad", { exact: true }).fill("Test Müşteri");
  await page.getByLabel("Ad soyad", { exact: true }).press("Enter");
  await expect(page.getByLabel("E-posta", { exact: true })).toBeFocused();
  await page.getByLabel("E-posta", { exact: true }).fill("customer@example.com");
  await page.getByLabel("Şifre", { exact: true }).fill("short");
  await page.getByRole("button", { name: "Hesap oluştur", exact: true }).click();
  await expect(page.getByText("Şifren en az 8 karakter olmalı.", { exact: true })).toBeVisible();
  await expect(page.getByText("Devam etmek için kullanım koşullarını ve KVKK metnini onayla.", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Şifre", { exact: true })).toBeFocused();
  await page.getByRole("tab", { name: "Giriş yap", exact: true }).click();
  await expect(page.getByText("Şifren en az 8 karakter olmalı.", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/En az 8 karakter kullan/)).toHaveCount(0);
  expect(tokenRequests).toHaveLength(0);
});

test("server auth failures remain actionable and do not clear entered fields", async ({ page }) => {
  await mockApi(page, { loginError: true });
  await page.goto("/auth");
  await page.getByLabel("E-posta", { exact: true }).fill("customer@example.com");
  await page.getByLabel("Şifre", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Giriş yap", exact: true }).click();
  await expect(page.getByText("E-posta veya şifre hatalı.", { exact: true })).toBeVisible();
  await expect(page.getByLabel("E-posta", { exact: true })).toHaveValue("customer@example.com");
  await expect(page.getByLabel("Şifre", { exact: true })).toHaveValue("test-password");
  await expect(page.getByRole("button", { name: "Giriş yap", exact: true })).toBeEnabled();
});
