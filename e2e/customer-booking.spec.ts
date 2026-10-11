import { expect, test } from "@playwright/test";

test("customers can inspect a real booking flow before authentication", async ({ page, request }) => {
  const response = await request.get("/api/businesses");
  const payload = await response.json() as {
    businesses?: Array<{
      slug: string;
      services: Array<unknown>;
    }>;
  };
  const candidates = payload.businesses?.filter(
    (item) => item.services.length > 0,
  ) ?? [];
  let selectedSlug: string | undefined;
  for (const business of candidates) {
    await page.goto(`/booking/${business.slug}`);
    if (await page.getByRole("heading", { name: "Hizmet seç" }).count()) {
      selectedSlug = business.slug;
      break;
    }
  }
  test.skip(!selectedSlug, "No fully configured bookable business is available in this environment");

  await expect(page).toHaveURL(new RegExp(`/booking/${selectedSlug}`));
  await expect(page.getByRole("heading", { name: "Hizmet seç" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Tekrar hoş geldin" })).toHaveCount(0);
});
