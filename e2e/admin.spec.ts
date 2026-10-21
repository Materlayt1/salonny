import { expect, test } from "@playwright/test";

test("admin routes use the dedicated protected login", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login/);
  await expect(page.getByRole("heading", { name: "Salonny Admin" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Yönetici e-postası" })).toBeVisible();
  await expect(page.getByLabel("Özel şifre")).toBeVisible();
});

for (const section of ["businesses", "users", "appointments", "reviews", "audit", "categories"]) {
  test(`private ${section} workspace cannot be opened by a guest`, async ({ page }) => {
    await page.goto(`/admin?section=${section}&q=PRIVATE-RECORD`);
    await expect(page).toHaveURL(/\/admin\/login/);
    await expect(page.getByRole("heading", { name: "Salonny Admin" })).toBeVisible();
    await expect(page.getByRole("table")).toHaveCount(0);
  });
}

test("admin credentials cannot be submitted before hydration or leaked through GET navigation", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, javaScriptEnabled: false });
  try {
    const page = await context.newPage(); await page.goto("/admin/login");
    await expect(page.locator('form[method="post"] input[name="email"]')).toBeDisabled();
    await expect(page.locator('input[name="password"]')).toBeDisabled();
    await expect(page.locator('form button:not([type])')).toBeDisabled();
  } finally { await context.close(); }
});

for (const [status, code] of [[400, "invalid_credentials"], [503, "unexpected_failure"]] as const) {
  test(`admin sign-in safely handles provider ${status} or an explicitly unconfigured service`, async ({ page }) => {
    let calls = 0;
    await page.route("**/auth/v1/**", route => route.abort("blockedbyclient"));
    await page.route("**/api/auth/supabase/**", route => {
      if (new URL(route.request().url()).pathname === "/api/auth/supabase/token") calls++;
      return route.fulfill({ status, contentType: "application/json", headers: { "X-Supabase-Api-Version": "2024-01-01" }, body: JSON.stringify({code,message:"PRIVATE PROVIDER TEXT"}) });
    });
    await page.goto("/admin/login");
    await page.getByLabel("Yönetici e-postası").fill("fixture@example.com");
    await page.getByLabel("Özel şifre").fill("fixture-only-password");
    await page.getByRole("button",{name:"Admin Paneline Gir"}).click();
    const error = page.locator("form").getByRole("alert");
    await expect(error).toBeVisible(); await expect(error).not.toContainText("PRIVATE PROVIDER TEXT");
    if (await error.textContent() === "Supabase bağlantısı yapılandırılmamış.") {
      expect(calls).toBe(0); // Clean CI has no Supabase configuration; no network failure is invented.
    } else {
      await expect(error).toHaveText(status === 400 ? "E-posta veya şifre hatalı." : "Giriş servisine ulaşılamadı. Bağlantını kontrol edip yeniden dene.");
      expect(calls).toBe(1);
    }
    await expect(page.getByLabel("Yönetici e-postası")).toHaveValue("fixture@example.com");
    await expect(page.getByLabel("Özel şifre")).toHaveValue("fixture-only-password");
    await expect(page.getByRole("button",{name:"Admin Paneline Gir"})).toBeEnabled();
    await expect(page).toHaveURL(/\/admin\/login$/);
  });
}
