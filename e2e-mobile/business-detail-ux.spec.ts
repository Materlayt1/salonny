import { expect, test } from "@playwright/test";
import { business, mockApi } from "./fixtures";

test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });

test("business section tabs stay visible and follow both tapped and manually scrolled sections", async ({ page }) => {
  await mockApi(page, { gallery: true });
  await page.goto(`/business/${business.slug}`);
  const tabs = page.getByTestId("business-section-tabs");
  const reviews = page.getByRole("tab", { name: "Yorumlar (12)" });
  await reviews.click();
  await expect(reviews).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: "Değerlendirmeler" })).toBeInViewport();
  await expect.poll(async () => (await tabs.boundingBox())?.y).toBeGreaterThanOrEqual(0);
  await expect.poll(async () => (await tabs.boundingBox())?.y).toBeLessThan(120);
  await expect(page.getByRole("button", { name: "Randevu al", exact: true })).toBeInViewport();
  await page.screenshot({ path: "artifacts/mobile-business-sticky-tabs.jpg", type: "jpeg", quality: 95 });

  await page.getByRole("tab", { name: "Hakkında", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Hakkında", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("Çalışma saatleri", { exact: true })).toBeInViewport();
  // RN Web overrides host.scrollTo with its native API, and mobile WebKit
  // does not expose mouse-wheel input. scrollTop triggers actual scroll events.
  await page.getByTestId("business-detail-scroll").evaluate((element) => { element.scrollTop = 0; });
  await expect.poll(() => page.getByTestId("business-detail-scroll").evaluate((element) => element.scrollTop)).toBe(0);
  await expect(page.getByRole("tab", { name: "Hizmetler", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "Çalışanlar", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Çalışanlar", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: "Uzmanlar", exact: true })).toBeInViewport();
  await page.getByTestId("business-detail-scroll").evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await expect.poll(() => page.getByTestId("business-detail-scroll").evaluate((element) => element.scrollHeight - element.scrollTop - element.clientHeight)).toBeLessThanOrEqual(1);
  await expect(page.getByRole("tab", { name: "Hakkında", exact: true })).toHaveAttribute("aria-selected", "true");
});

test("the fullscreen gallery supports bounded zoom, navigation, reset and closing without a browser tab", async ({ page, context }) => {
  await mockApi(page, { gallery: true });
  await page.goto(`/business/${business.slug}`);
  await page.getByRole("button", { name: `${business.name} fotoğraflarını tam ekran aç` }).click();
  const viewer = page.getByTestId("business-gallery-viewer");
  await expect(viewer).toBeVisible();
  await expect(viewer.getByText("Fotoğraf 1 / 2", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Önceki fotoğraf", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Fotoğrafı uzaklaştır", exact: true })).toBeDisabled();
  const zoom = page.getByRole("button", { name: "Fotoğraf yakınlaştırmasını sıfırla", exact: true });
  for (let index = 0; index < 4; index++) await page.getByRole("button", { name: "Fotoğrafı yakınlaştır", exact: true }).click();
  await expect(zoom).toHaveText("%300");
  await expect(page.getByRole("button", { name: "Fotoğrafı yakınlaştır", exact: true })).toBeDisabled();
  await zoom.click();
  await expect(zoom).toHaveText("%100");
  await page.getByRole("button", { name: "Fotoğrafı yakınlaştır", exact: true }).click();
  await expect(zoom).toHaveText("%150");
  await page.getByRole("button", { name: "Sonraki fotoğraf", exact: true }).click();
  await expect(viewer.getByText("Fotoğraf 2 / 2", { exact: true })).toBeVisible();
  await expect(zoom).toHaveText("%100");
  await expect(page.getByRole("button", { name: "Sonraki fotoğraf", exact: true })).toBeDisabled();
  await page.keyboard.press("ArrowLeft");
  await expect(viewer.getByText("Fotoğraf 1 / 2", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(viewer).not.toBeVisible();
  await page.getByRole("button", { name: `${business.name}, fotoğraf 2 tam ekran aç` }).click();
  await expect(viewer.getByText("Fotoğraf 2 / 2", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Fotoğraf galerisini kapat", exact: true }).click();
  await expect(viewer).not.toBeVisible();
  expect(context.pages()).toHaveLength(1);
});

test("a failed gallery photo has a working retry and the modal remains closable", async ({ page }) => {
  await mockApi(page, { gallery: true });
  let reads = 0;
  let allowPhoto = false;
  await page.route("http://localhost:3001/recovered/gogo-varol.webp", async (route) => {
    reads += 1;
    if (!allowPhoto) return route.fulfill({ status: 404, body: "Missing photo" });
    return route.fulfill({ contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jNogAAAAASUVORK5CYII=", "base64") });
  });
  await page.goto(`/business/${business.slug}`);
  await page.getByRole("button", { name: `${business.name}, fotoğraf 2 tam ekran aç` }).click();
  const viewer = page.getByTestId("business-gallery-viewer");
  await expect(viewer.getByText("Fotoğraf yüklenemedi.", { exact: true })).toBeVisible();
  const failedReads = reads;
  allowPhoto = true;
  await viewer.getByRole("button", { name: "Yeniden dene", exact: true }).click();
  await expect(viewer.getByText("Fotoğraf yüklenemedi.", { exact: true })).toHaveCount(0);
  await expect.poll(() => reads).toBeGreaterThan(failedReads);
  await page.getByRole("button", { name: "Fotoğraf galerisini kapat", exact: true }).click();
  await expect(viewer).not.toBeVisible();
});
