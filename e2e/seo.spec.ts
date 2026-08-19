import { expect, test } from "@playwright/test";

test("robots and segmented sitemap expose only public canonical routes", async ({ request }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "HTTP metadata assertion only needs one browser project");

  const robots = await request.get("/robots.txt");
  expect(robots.ok()).toBeTruthy();
  const robotsText = await robots.text();
  expect(robotsText).toContain("Sitemap: http://localhost:3000/sitemap/0.xml");
  expect(robotsText).toContain("Disallow: /admin/");
  expect(robotsText).toContain("Disallow: /business/dashboard");

  const sitemap = await request.get("/sitemap/0.xml");
  expect(sitemap.ok()).toBeTruthy();
  const sitemapText = await sitemap.text();
  expect(sitemapText).toContain("<loc>http://localhost:3000</loc>");
  expect(sitemapText).toContain("<loc>http://localhost:3000/kesfet</loc>");
  expect(sitemapText).not.toContain("/admin");
  expect(sitemapText).not.toContain("/business/dashboard");
});
