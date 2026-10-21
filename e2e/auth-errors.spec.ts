import { expect, test } from "@playwright/test";

const cases = [
  {
    name: "modern invalid credentials",
    status: 400,
    body: { code: "invalid_credentials", msg: "Fixture provider-only credentials detail" },
    version: "2024-01-01",
    expected: "E-posta veya şifre hatalı.",
  },
  {
    name: "code-less rate limit",
    status: 429,
    body: { error: "Fixture provider-only rate detail" },
    version: undefined,
    expected: "Çok fazla deneme yaptın. Birkaç dakika sonra yeniden dene.",
  },
  {
    name: "retryable service outage",
    status: 503,
    body: { code: "service_unavailable", error: "Fixture provider-only service detail" },
    version: undefined,
    expected: "Giriş servisine ulaşılamadı. Bağlantını kontrol edip yeniden dene.",
  },
] as const;

for (const fixture of cases) {
  test(`login identifies ${fixture.name} and keeps the form retryable`, async ({ page }) => {
    const requests: Array<{ path: string; body: unknown; version: string | undefined }> = [];
    // This regression uses the actual browser SDK/form but intercepts every
    // auth request, so no fixture credentials reach a live project/account.
    await page.route("**/auth/v1/**", (route) => route.abort("blockedbyclient"));
    await page.route("**/api/auth/supabase/**", async (route) => {
      const request = route.request();
      const target = new URL(request.url());
      if (target.pathname === "/api/auth/supabase/token" && request.method() === "POST") {
        expect(target.searchParams.get("grant_type")).toBe("password");
        requests.push({ path: target.pathname, body: request.postDataJSON(), version: request.headers()["x-supabase-api-version"] });
        await route.fulfill({
          status: fixture.status,
          json: fixture.body,
          headers: {
            "Cache-Control": "private, no-store",
            ...(fixture.status === 429 ? { "Retry-After": "5" } : {}),
            ...(fixture.version ? { "X-Supabase-Api-Version": fixture.version } : {}),
          },
        });
        return;
      }
      await route.fulfill({ status: 503, json: { error_code: "service_unavailable", error: "Fixture unexpected auth operation" } });
    });

    await page.goto("/auth/login?next=%2Fprofile");
    const email = page.getByLabel("E-posta", { exact: true });
    const password = page.locator('input[name="password"]');
    const submit = page.getByRole("button", { name: "Giriş Yap", exact: true });
    const formError = page.locator("form").getByRole("alert");
    await expect(email).toBeEditable();
    await expect(password).toBeEditable();
    await email.fill("fixture@example.com");
    await password.fill("fixture-only-password");
    await submit.click();

    await expect(formError).toHaveText(fixture.expected);
    await expect(formError).not.toContainText("Fixture provider-only");
    await expect(page).toHaveURL(/\/auth\/login\?next=%2Fprofile$/);
    await expect(email).toHaveValue("fixture@example.com");
    await expect(password).toHaveValue("fixture-only-password");
    await expect(submit).toBeEnabled();
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      path: "/api/auth/supabase/token",
      body: { email: "fixture@example.com", password: "fixture-only-password" },
      version: "2024-01-01",
    });

    await submit.click();
    await expect(formError).toHaveText(fixture.expected);
    await expect(submit).toBeEnabled();
    expect(requests).toHaveLength(2);
  });
}

test("server-rendered login and signup cannot accept input before hydration", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto("/auth/login");
    await expect(page.getByLabel("E-posta", { exact: true })).toHaveAttribute("readonly", "");
    await expect(page.locator('input[name="password"]')).toHaveAttribute("readonly", "");
    // Streamed Next HTML may keep server segments hidden without JavaScript.
    // Inspect their actual input/button attributes, not an accessibility tree
    // that intentionally excludes those not-yet-committed server segments.
    await expect(page.locator("form button:not([type])")).toBeDisabled();
    await expect(page.locator('button[aria-label="Şifreyi göster"]')).toBeDisabled();
    await expect(page.locator("button").filter({ hasText: "İşletmeyim" })).toBeDisabled();
    await expect(page.locator('[role="status"]')).toHaveText("Giriş ekranı hazırlanıyor...");

    await page.goto("/auth/login?mode=signup&account=business");
    for (const name of ["email", "password", "full_name", "phone", "city", "business_name"]) {
      await expect(page.locator(`input[name="${name}"]`)).toHaveAttribute("readonly", "");
    }
    await expect(page.locator("form button:not([type])")).toBeDisabled();
    for (const name of ["terms_consent", "kvkk_consent", "marketing_consent"]) await expect(page.locator(`input[name="${name}"]`)).toBeDisabled();
  } finally {
    await context.close();
  }
});
