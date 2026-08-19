import { expect, test } from "@playwright/test";

test("signup and login modes render a usable Supabase form", async ({ page }) => {
  await page.goto("/auth/login?mode=signup");

  await expect(page.getByRole("heading", { name: /'ye katıl$/ })).toBeVisible();
  await expect(page.getByRole("img", { name: /Modern .* kuaför salonu/ }).first()).toBeVisible();
  await expect(page.getByLabel("E-posta")).toHaveValue("");
  await expect(page.locator('input[name="password"]')).toHaveValue("");
  await expect(page.getByRole("button", { name: /Google ile devam et/ })).toBeDisabled();

  const password = page.locator('input[name="password"]');
  await password.fill("guvenli-sifre");
  await expect(password).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "Şifreyi göster" }).click();
  await expect(password).toHaveAttribute("type", "text");

  await page.getByRole("button", { name: "Giriş yap", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Tekrar hoş geldin" })).toBeVisible();
  await expect(page.getByLabel("E-posta")).toHaveValue("");
});

test("business onboarding requires authentication and opens the detailed business signup", async ({ page }) => {
  await page.goto("/business/onboarding");
  await expect(page).toHaveURL(/\/auth\/login\?.*account=business/);
  await page.getByRole("button", { name: "Ücretsiz kayıt ol" }).click();

  await expect(page.getByLabel("İşletme adı")).toBeVisible();
  await expect(page.getByLabel("Ad soyad")).toBeVisible();
  await expect(page.getByLabel("Telefon")).toBeVisible();
  await expect(page.getByLabel("Şehir")).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /Kullanım Şartları/ })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /KVKK Aydınlatma Metni/ })).toBeVisible();
});
