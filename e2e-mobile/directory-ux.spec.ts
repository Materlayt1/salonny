import { expect, test } from "@playwright/test";
import { mockApi } from "./fixtures";
test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });

test("filter drafts only change results when applied and reset is actionable", async ({ page }) => {
  await mockApi(page);
  const queries: URL[] = []; page.on("request", (request) => { if (new URL(request.url()).pathname === "/api/businesses") queries.push(new URL(request.url())); });
  await page.goto("/discover");
  await expect(page.getByText("1 sonuç", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Filtreler", exact: true }).click();
  const sheet = page.getByTestId("business-filter-sheet");
  await sheet.getByLabel("Şehir filtresi").fill(" İzmir ");
  await sheet.getByRole("button", { name: "Kuaför", exact: true }).click();
  await sheet.getByRole("button", { name: "Uygun fiyat", exact: true }).click();
  await sheet.getByLabel("Yalnız şu an açık işletmeler").check();
  expect(queries.some((query) => query.searchParams.has("city"))).toBe(false);
  await sheet.getByRole("button", { name: "Filtreleri uygula" }).click();
  await expect(page.getByRole("button", { name: "Filtreler, 4 etkin", exact: true })).toBeVisible();
  await expect.poll(() => queries.some((query) => query.searchParams.get("city") === "İzmir" && query.searchParams.get("category") === "kuafor" && query.searchParams.get("sort") === "price" && query.searchParams.get("open") === "1")).toBe(true);
  await page.getByRole("button", { name: "Temizle", exact: true }).click();
  await expect(page.getByRole("button", { name: "Filtreler", exact: true })).toBeVisible();
  // Reset may reuse the fresh unfiltered query cache, without another network request.
  await page.getByRole("button", { name: "Filtreler", exact: true }).click();
  await expect(sheet.getByLabel("Şehir filtresi")).toHaveValue("");
  await expect(sheet.getByRole("button", { name: "Önerilen", exact: true }).getByText("Önerilen", { exact: true })).toHaveCSS("color", "rgb(255, 255, 255)");
  await expect(sheet.getByLabel("Yalnız şu an açık işletmeler")).not.toBeChecked();
});

test("closing filters discards drafts and narrow sheet stays in bounds", async ({ page }) => {
  await mockApi(page); await page.goto("/discover");
  await page.getByRole("button", { name: "Filtreler", exact: true }).click();
  await page.setViewportSize({ width: 320, height: 844 });
  const sheet = page.getByTestId("business-filter-sheet");
  await sheet.getByLabel("Şehir filtresi").fill("Ankara");
  const box = await sheet.boundingBox(); expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(320);
  await sheet.getByRole("button", { name: "Filtreleri kapat", exact: true }).click();
  await page.getByRole("button", { name: "Filtreler", exact: true }).click();
  await expect(sheet.getByLabel("Şehir filtresi")).toHaveValue("");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(sheet.getByRole("button", { name: "Filtreleri uygula", exact: true })).toBeInViewport({ ratio: 1 });
  await page.screenshot({ path: "artifacts/mobile-native-filters.jpg", type: "jpeg", quality: 95 });
});

test("empty discovery has a direct way back to real results", async ({ page }) => {
  await mockApi(page, { emptyDirectory: true }); await page.goto("/discover");
  await page.getByRole("button", { name: "Filtreler", exact: true }).click();
  await page.getByLabel("Şehir filtresi").fill("Bilinmeyen şehir");
  await page.getByRole("button", { name: "Filtreleri uygula", exact: true }).click();
  await expect(page.getByText("Sonuç bulunamadı", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Filtreleri temizle", exact: true }).click();
  await expect(page.getByRole("button", { name: "Test salonu işletmesini aç", exact: true })).toBeVisible();
});

test("discovery toolbar remains available after scrolling", async ({ page }) => {
  await mockApi(page); await page.goto("/discover?map=1");
  await expect(page.getByRole("button", { name: "Test salonu işletmesini aç", exact: true })).toBeAttached();
  await page.getByRole("button", { name: "Test salonu işletmesini aç", exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByRole("button", { name: "Filtreler", exact: true })).toBeInViewport();
  await expect(page.getByLabel("İşletme veya hizmet ara")).toBeInViewport();
});

test("cards have readable metadata and a large favorite hit region", async ({ page }) => {
  await mockApi(page); await page.goto("/discover");
  const favorite = page.getByRole("button", { name: "Test salonu favorilere ekle", exact: true });
  await favorite.scrollIntoViewIfNeeded();
  const box = await favorite.boundingBox(); expect(box!.width).toBeGreaterThanOrEqual(48); expect(box!.height).toBeGreaterThanOrEqual(48);
  await expect(page.getByText("Bornova", { exact: true })).toHaveCSS("font-size", "12px");
  await expect(page.getByText("Uygun saatleri gör", { exact: true })).toHaveCSS("font-size", "12px");
});

test("loading results uses honest static card placeholders", async ({ page }) => {
  await mockApi(page, { delayedDirectory: true }); await page.goto("/discover");
  await expect(page.getByTestId("business-list-skeleton")).toBeVisible();
  await expect(page.getByRole("button", { name: "Test salonu işletmesini aç", exact: true })).toBeAttached();
  await expect(page.getByTestId("business-list-skeleton")).toHaveCount(0);
});
