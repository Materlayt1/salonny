import { expect, test, type Page } from "@playwright/test";
import { business, mockApi, signIn } from "./fixtures";

async function directory(page: Page, options: { failNext?: boolean; slowSearch?: boolean } = {}) {
  const writes = await mockApi(page, { businessAccount: true });
  const reads: URL[] = [];
  let failed = false;
  await page.route("http://localhost:3001/api/business-management/inventory?**", async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const url = new URL(route.request().url()); reads.push(url);
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const q = url.searchParams.get("q") ?? "";
    const headers = { "Access-Control-Allow-Origin": "http://localhost:8082" };
    if (options.failNext && offset === 50 && !failed) { failed = true; return route.fulfill({ status: 503, headers, json: { error: "Stok servisi geçici olarak kapalı." } }); }
    if (options.slowSearch && q === "eski") await new Promise((resolve) => setTimeout(resolve, 650));
    const all = Array.from({ length: 51 }, (_, i) => ({ id: `10000000-0000-4000-8000-${String(i + 1000).padStart(12, "0")}`, title: `Ürün ${String(i + 1).padStart(3, "0")}`, subtitle: `SKU-${i + 1}`, sku: `SKU-${i + 1}`, stock_quantity: 10, minimum_stock: 2, active: true, purchase_price_minor: 12345, sale_price_minor: 23456 }));
    const selected = q === "eski" ? [{ ...all[0], title: "Eski arama sonucu" }] : q ? all.filter((row) => row.sku === q) : all;
    return route.fulfill({ headers, json: { rows: selected.slice(offset, offset + 50), total: selected.length, hasMore: offset + 50 < selected.length } });
  });
  await signIn(page); await page.goto("/manage/inventory");
  await expect(page.getByText("51 eşleşen kayıt · 50 kayıt yüklendi. Liste işletme geneline aittir.", { exact: true })).toBeVisible();
  return { reads, writes };
}

async function loadNext(page: Page) {
  const button = page.getByRole("button", { name: "Daha fazla kayıt", exact: true });
  // FlatList estimates off-screen heights. One giant automatic scroll can move
  // the footer again while rows materialize; never click until the real last
  // row is on screen. No repeated click, request retry or relaxed assertion.
  await expect(async () => {
    await button.scrollIntoViewIfNeeded();
    await expect(page.getByText("Ürün 050", { exact: true })).toBeVisible({ timeout: 500 });
  }).toPass({ timeout: 5000 });
  await button.click();
}

test("native stock pages beyond the first fifty with scope intact", async ({ page }) => {
  const run = await directory(page);
  await loadNext(page);
  await expect(page.getByText("Ürün 051", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Daha fazla kayıt", exact: true })).toHaveCount(0);
  expect(run.reads.at(-1)?.searchParams.get("offset")).toBe("50");
  expect(run.reads.at(-1)?.searchParams.get("businessId")).toBe(business.id);
  expect(run.reads.at(-1)?.searchParams.get("branchId")).toBe(business.branchId);
  expect(run.writes).toEqual([]);
});

test("next-page outage retains the current page and retries only the failed stock page", async ({ page }) => {
  const run = await directory(page, { failNext: true });
  await loadNext(page);
  await expect.poll(() => run.reads.some((url) => url.searchParams.get("offset") === "50")).toBe(true);
  await expect(page.getByText(/Sonraki sayfa alınamadı. Yüklenen kayıtlar korundu/)).toBeVisible();
  await expect(page.getByText("Ürün 050", { exact: true })).toBeAttached();
  await expect(page.getByText("Veriler alınamadı", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Sonraki sayfayı yeniden dene", exact: true }).click();
  await expect(page.getByText("Ürün 051", { exact: true })).toBeVisible();
  expect(run.reads.map((url) => url.searchParams.get("offset"))).toEqual(["0", "50", "50"]);
  expect(run.writes).toEqual([]);
});

test("stock-code search reaches a product outside page one and resets pagination", async ({ page }) => {
  const run = await directory(page);
  await page.getByLabel("Panelde ara", { exact: true }).fill("SKU-51");
  await expect(page.getByText("Ürün 051", { exact: true })).toBeVisible();
  await expect(page.getByText("Ürün 001", { exact: true })).toHaveCount(0);
  expect(run.reads.at(-1)?.searchParams.get("q")).toBe("SKU-51");
  expect(run.reads.at(-1)?.searchParams.get("offset")).toBe("0");
  expect(run.writes).toEqual([]);
});

test("a slow old stock search cannot replace the latest result", async ({ page }) => {
  const run = await directory(page, { slowSearch: true });
  await page.getByLabel("Panelde ara", { exact: true }).fill("eski");
  await expect.poll(() => run.reads.some((url) => url.searchParams.get("q") === "eski")).toBe(true);
  await page.getByLabel("Panelde ara", { exact: true }).fill("SKU-51");
  await expect(page.getByText("Ürün 051", { exact: true })).toBeVisible();
  await page.waitForTimeout(750); // Deliver the deliberately older response.
  await expect(page.getByText("Eski arama sonucu", { exact: true })).toHaveCount(0);
  expect(run.writes).toEqual([]);
});

test("native inventory field limits match the website and API without truncating a valid long name", async ({ page }) => {
  const run = await directory(page);
  await page.getByRole("button", { name: "Düzenle", exact: true }).first().click();
  await page.getByLabel("Ürün adı", { exact: true }).fill("x".repeat(161));
  await expect(page.getByLabel("Ürün adı", { exact: true })).toHaveValue("x".repeat(160));
  await page.getByLabel("Stok kodu", { exact: true }).fill("y".repeat(81));
  await expect(page.getByLabel("Stok kodu", { exact: true })).toHaveValue("y".repeat(80));
  await page.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect.poll(() => run.writes.filter((write) => write.path === "/api/business-management/inventory").length).toBe(1);
  expect(run.writes[0].body).toMatchObject({ name: "x".repeat(160), sku: "y".repeat(80), purchasePrice: 123.45, salePrice: 234.56 });
});
