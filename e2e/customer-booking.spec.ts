import { expect, test } from "@playwright/test";

test("booking requires a real published business and an authenticated customer", async ({ page, request }) => {
  const response = await request.get("/api/businesses");
  const payload = await response.json() as { businesses?: Array<{ slug: string }> };
  const business = payload.businesses?.[0];
  test.skip(!business, "No published business is available in this environment");

  await page.goto(`/booking/${business!.slug}`);
  await expect(page).toHaveURL(/\/auth\/login\?.*next=/);
  await expect(page.getByRole("heading", { name: "Tekrar hoş geldin" })).toBeVisible();
});
