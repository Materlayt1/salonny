import { expect, test } from "@playwright/test";

test("admin routes use the dedicated protected login", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login/);
  await expect(page.getByRole("heading", { name: "Salonny Admin" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Yönetici e-postası" })).toBeVisible();
  await expect(page.getByLabel("Özel şifre")).toBeVisible();
});
