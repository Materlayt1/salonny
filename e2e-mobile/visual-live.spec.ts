import { expect, test } from "@playwright/test";
test.use({ deviceScaleFactor: 1, viewport: { width: 390, height: 844 } });
test("capture the native home with real public marketplace data", async ({ page }) => {
  test.skip(process.env.MOBILE_LIVE_VISUAL !== "1", "Read-only local visual acceptance, enabled explicitly.");
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByText("En popüler işletmeler", { exact: true })).toBeVisible({ timeout: 25_000 });
  await expect(page.getByText("Tüm işletmeler", { exact: true })).toBeAttached();
  expect(errors).toEqual([]);
  await page.screenshot({ path: "artifacts/mobile-native-home.jpg", type: "jpeg", quality: 95 });
});

test("capture discovery map with real public businesses", async ({ page }) => {
  test.skip(process.env.MOBILE_LIVE_VISUAL !== "1", "Read-only local visual acceptance, enabled explicitly.");
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/discover?map=1");
  await expect(page.getByTestId("business-map")).toBeVisible();
  const pin = page.getByRole("button", { name: /Gogo, .* işletmesini seç/ }).first();
  await expect(pin).toBeVisible({ timeout: 25_000 });
  await pin.click();
  await expect(page.getByRole("button", { name: "Gogo işletmesini aç", exact: true })).toHaveCount(3);
  expect(errors).toEqual([]);
  await page.screenshot({ path: "artifacts/mobile-native-map.jpg", type: "jpeg", quality: 95 });
});
