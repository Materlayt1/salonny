import { expect, test } from "@playwright/test";

test("customers can inspect a real booking flow before authentication", async ({ page, request }) => {
  const response = await request.get("/api/businesses");
  const payload = await response.json() as {
    businesses?: Array<{
      slug: string;
      services: Array<unknown>;
    }>;
  };
  const business = payload.businesses?.find(
    (item) => item.services.length > 0,
  );
  test.skip(!business, "No bookable published business is available in this environment");

  await page.goto(`/booking/${business!.slug}`);
  await expect(page).toHaveURL(new RegExp(`/booking/${business!.slug}`));
  await expect(page.getByRole("heading", { name: "Hizmet seç" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Tekrar hoş geldin" })).toHaveCount(0);
});
