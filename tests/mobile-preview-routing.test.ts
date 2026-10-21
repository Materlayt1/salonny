import { describe, expect, it } from "vitest";
import { dynamicPreviewDocument } from "../scripts/mobile-preview-routing.mjs";

describe("static mobile preview route documents", () => {
  it.each([
    ["/manage/appointments", "manage/[section].html"],
    ["/manage/operations/", "manage/[section].html"],
    ["/business/gogo", "business/[slug].html"],
    ["/booking/gogo", "booking/[slug].html"],
    ["/appointment/10000000-0000-4000-8000-000000000002", "appointment/[id].html"],
  ])("uses the exported screen document for %s", (path, document) => {
    expect(dynamicPreviewDocument(path)).toBe(document);
  });

  it.each(["/missing.js", "/manage/chunk.js", "/manage/../auth", "/unknown/route", "/constructor/a", "/toString/a", "/__proto__/a", "/manage", "/manage/a/b", "/"])("does not turn missing assets or unknown routes into homepage HTML: %s", (path) => {
    expect(dynamicPreviewDocument(path)).toBeNull();
  });
});
