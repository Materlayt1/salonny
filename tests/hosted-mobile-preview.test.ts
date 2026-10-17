import { describe, expect, it } from "vitest";
import { resolveApiOrigin } from "../apps/mobile/lib/api-origin";
import appConfig from "../apps/mobile/app.config";
import { hostedMobileRewrites } from "../lib/hosted-mobile-routes";

describe("hosted native browser preview", () => {
  const options = { hostedWeb: false, development: false, developmentUrl: "http://localhost:3001" };
  it("uses the actual browser origin, never a stale API URL, in hosted web mode", () => {
    expect(resolveApiOrigin({ ...options, hostedWeb: true, browserOrigin: "https://preview.example", configuredUrl: "http://localhost:3001" })).toBe("https://preview.example");
  });
  it("does not invent an API origin while statically rendering", () => {
    expect(resolveApiOrigin({ ...options, hostedWeb: true })).toBe("");
  });
  it("preserves explicit native release and development API settings", () => {
    expect(resolveApiOrigin({ ...options, configuredUrl: "https://api.example///" })).toBe("https://api.example");
    expect(resolveApiOrigin({ ...options, development: true })).toBe("http://localhost:3001");
    expect(resolveApiOrigin(options)).toBe("");
  });
  it("adds a subpath only for the hosted export and preserves app identity", () => {
    const previous = process.env.SALONNY_HOSTED_MOBILE_PREVIEW;
    try {
      const context = { config: { name: "Salonny", slug: "salonny", scheme: "salonny", experiments: { typedRoutes: true } }, projectRoot: "", staticConfigPath: null, packageJsonPath: "" };
      process.env.SALONNY_HOSTED_MOBILE_PREVIEW = "1";
      expect(appConfig(context)).toMatchObject({ scheme: "salonny", experiments: { typedRoutes: true, baseUrl: "/mobile" } });
      delete process.env.SALONNY_HOSTED_MOBILE_PREVIEW;
      expect(appConfig(context).experiments).not.toHaveProperty("baseUrl");
    } finally {
      if (previous === undefined) delete process.env.SALONNY_HOSTED_MOBILE_PREVIEW;
      else process.env.SALONNY_HOSTED_MOBILE_PREVIEW = previous;
    }
  });
  it("serves exported screen templates without a catch-all for assets", () => {
    expect(hostedMobileRewrites).toContainEqual({ source: "/mobile", destination: "/mobile/index.html" });
    expect(hostedMobileRewrites).toContainEqual({ source: "/mobile/manage/:value([^/.]+)", destination: "/mobile/manage/%5Bsection%5D.html" });
    expect(hostedMobileRewrites.every((rule) => !rule.source.includes(":path*") && rule.destination.endsWith(".html"))).toBe(true);
  });
});
