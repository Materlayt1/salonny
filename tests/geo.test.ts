import { describe, expect, it } from "vitest";
import { isInTurkey, isValidCoordinate } from "@/lib/geo";
import { formatFileSize } from "@/lib/image-upload";

describe("location coordinate validation", () => {
  it("accepts valid Turkish business coordinates", () => {
    expect(isValidCoordinate(38.4391964, 27.1437836)).toBe(true);
    expect(isInTurkey(38.4391964, 27.1437836)).toBe(true);
  });

  it("rejects missing, zero and out-of-range map points", () => {
    expect(isValidCoordinate(0, 0)).toBe(false);
    expect(isValidCoordinate(Number.NaN, 27.14)).toBe(false);
    expect(isValidCoordinate(95, 27.14)).toBe(false);
    expect(isInTurkey(51.5072, -0.1276)).toBe(false);
  });
});

describe("image upload size formatting", () => {
  it("reports compressed image sizes in KB and large originals in MB", () => {
    expect(formatFileSize(412 * 1_024)).toBe("412 KB");
    expect(formatFileSize(4.8 * 1_024 * 1_024)).toBe("4,8 MB");
  });
});
