import { expect, test } from "@playwright/test";

test("desktop navigation exposes customer appointments", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop-only navigation assertion");
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Randevularım" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Keşfet", exact: true }).first()).toBeVisible();
});

test("business entry sends users without a business to the free setup flow", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop header assertion");
  await page.goto("/");
  const businessEntry = page.getByRole("link", { name: "İşletme Ol", exact: true });
  await expect(businessEntry).toHaveAttribute("href", "/business");
  await businessEntry.click();
  await expect(page.getByRole("heading", { name: /İşletmeni .* ile/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Ücretsiz Başla/ }).first()).toHaveAttribute("href", "/business/onboarding");
});

test("desktop marketplace screens expose the real published business layout", async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop-only layout assertion");
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Hizmetin/ })).toBeVisible();
  await page.goto("/kesfet");
  await expect(page.getByTestId("desktop-discover-map")).toBeVisible();
  const response = await request.get("/api/businesses");
  const payload = await response.json() as { businesses?: Array<{ slug: string; name: string }> };
  const business = payload.businesses?.[0];
  test.skip(!business, "No published business is available in this environment");
  await expect(page.getByTestId("desktop-discover-map").getByRole("button", { name: `${business!.name} harita işareti` })).toBeVisible();
  await expect(page.getByTestId("desktop-discover-map")).toContainText(/işletme haritada/);
  await page.goto(`/business/${business!.slug}`);
  await expect(page.getByRole("heading", { name: business!.name, exact: true })).toBeVisible();
});

test("business photos open in a navigable gallery", async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop gallery assertion");
  const response = await request.get("/api/businesses");
  const payload = await response.json() as { businesses?: Array<{ slug: string; name: string; gallery: string[] }> };
  const business = payload.businesses?.[0];
  test.skip(!business, "No published business is available in this environment");
  await page.goto(`/business/${business!.slug}`);
  await page.getByRole("button", { name: `${business!.name} fotoğraflarını aç` }).first().click();
  const gallery = page.getByRole("dialog", { name: `${business!.name} fotoğraf galerisi` });
  await expect(gallery).toBeVisible();
  await expect(gallery.getByText(`1 / ${business!.gallery.length}`)).toBeVisible();
  if (business!.gallery.length > 1) {
    await gallery.getByRole("button", { name: "Sonraki fotoğraf" }).click();
    await expect(gallery.getByText(`2 / ${business!.gallery.length}`)).toBeVisible();
  }
  await gallery.getByRole("button", { name: "Galeriyi kapat" }).click();
  await expect(gallery).toBeHidden();
});

test("mobile navigation matches the five-item booking layout", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Mobile-only navigation assertion");
  await page.goto("/");
  const navigation = page.getByRole("navigation").last();
  await expect(navigation.getByRole("link", { name: "Ana Sayfa" })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Keşfet" })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Randevu", exact: true })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Randevular", exact: true })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Profilim" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Bildirimler" })).toBeVisible();
});

test("mobile discover opens with a map and can switch to the list", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Mobile-only map assertion");
  await page.goto("/kesfet");
  await expect(page.getByTestId("mobile-discover-map")).toBeVisible();
  await page.getByRole("button", { name: "Listeyi göster" }).click();
  await expect(page.getByRole("button", { name: "Haritayı göster" })).toBeVisible();
});
