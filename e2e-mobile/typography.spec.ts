import { expect, test } from "@playwright/test";
import { mockApi, signIn } from "./fixtures";

test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });

function contrast(foreground: number[], background: number[]) {
  const luminance = (rgb: number[]) => rgb.map((value) => value / 255).map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
  const a = luminance(foreground); const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

test("auth typography is lighter, keeps contrast and fits narrow phones", async ({ page }) => {
  await mockApi(page); await page.goto("/auth");
  const title = page.getByText("Tekrar hoş geldin", { exact: true });
  await expect(title).toHaveCSS("font-weight", "600");
  await expect(title).toHaveCSS("color", "rgb(48, 49, 59)");
  await expect(page.getByRole("button", { name: "Giriş yap", exact: true }).getByText("Giriş yap", { exact: true })).toHaveCSS("font-weight", "600");
  const color = await title.evaluate((element) => getComputedStyle(element).color);
  expect(contrast(color.match(/\d+/g)!.map(Number), [255, 255, 255])).toBeGreaterThanOrEqual(4.5);
  const muted = await page.getByText("Randevularına ve favorilerine devam et.", { exact: true }).evaluate((element) => getComputedStyle(element).color);
  expect(contrast(muted.match(/\d+/g)!.map(Number), [255, 255, 255])).toBeGreaterThanOrEqual(4.5);
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    for (const label of ["E-posta", "Şifre"]) {
      const box = await page.getByLabel(label, { exact: true }).boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(20);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width - 20);
      expect(box!.width).toBeLessThanOrEqual(392);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "artifacts/mobile-typography-auth.jpg", type: "jpeg", quality: 95 });
});

test("home preserves heading hierarchy without extra-bold text", async ({ page }) => {
  await mockApi(page); await page.goto("/");
  await expect(page.getByText("Tüm işletmeler", { exact: true })).toHaveCSS("font-weight", "600");
  await expect(page.getByText("Tüm işletmeler", { exact: true })).toHaveCSS("line-height", "28px");
  await page.getByText("Tüm işletmeler", { exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByRole("button", { name: "En yüksek puan", exact: true }).last().getByText("En yüksek puan", { exact: true })).toHaveCSS("font-weight", "500");
});

test("profile menu uses medium-weight labels instead of heavy black text", async ({ page }) => {
  await mockApi(page); await signIn(page); await page.goto("/profile");
  await expect(page.getByText("Kişisel bilgiler", { exact: true })).toHaveCSS("font-weight", "500");
  await expect(page.getByText("Kişisel bilgiler", { exact: true })).toHaveCSS("color", "rgb(48, 49, 59)");
});
