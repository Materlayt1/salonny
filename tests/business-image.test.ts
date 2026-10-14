import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { prepareBusinessImage } from "@/lib/business-image";

describe("public business image sanitation", () => {
  it.each(["png", "jpeg", "webp"] as const)("re-encodes bounded %s to an ordinary JPEG", async (format) => {
    const input = await sharp({ create: { width: 30, height: 20, channels: 3, background: "#6C4BF4" } }).toFormat(format).toBuffer();
    const processed = await prepareBusinessImage(input.toString("base64"));
    const result = await sharp(processed.bytes).metadata();
    expect(result.format).toBe("jpeg"); expect(result.width).toBe(30); expect(processed.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.exif).toBeUndefined(); expect(result.xmp).toBeUndefined(); expect(result.iptc).toBeUndefined();
  });
  it("removes EXIF/GPS rather than trusting the client checkbox", async () => {
    const input = await sharp({ create: { width: 30, height: 20, channels: 3, background: "red" } }).withExif({ IFD0: { Artist: "private-name", ImageDescription: "private-place" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "38/1 25/1 0/1", GPSLongitudeRef: "E", GPSLongitude: "27/1 8/1 0/1" } }).jpeg().toBuffer();
    expect((await sharp(input).metadata()).exif).toBeDefined();
    const processed = await prepareBusinessImage(input.toString("base64"));
    expect((await sharp(processed.bytes).metadata()).exif).toBeUndefined(); expect(processed.bytes.includes(Buffer.from("private-name"))).toBe(false);
  });
  it("never upscales small images and deterministically retries identical content", async () => {
    const input = await sharp({ create: { width: 30, height: 20, channels: 3, background: "blue" } }).png().toBuffer();
    const first = await prepareBusinessImage(input.toString("base64")); const second = await prepareBusinessImage(input.toString("base64"));
    expect(first.hash).toBe(second.hash); expect(first.bytes.equals(second.bytes)).toBe(true);
  });
  it.each(["", "<svg xmlns='http://www.w3.org/2000/svg'/>", "GIF89a", "\xff\xd8\xfftruncated"])("rejects unsupported or truncated bytes", async (value) => {
    await expect(prepareBusinessImage(Buffer.from(value).toString("base64"))).rejects.toMatchObject({ status: 422 });
  });
  it("rejects oversized encoded input", async () => { await expect(prepareBusinessImage(Buffer.alloc(2 * 1024 * 1024 + 1, 0xff).toString("base64"))).rejects.toMatchObject({ status: 422 }); });
  it("rejects more than four million decoded pixels", async () => {
    const input = await sharp({ create: { width: 2001, height: 2000, channels: 3, background: "white" } }).png().toBuffer();
    await expect(prepareBusinessImage(input.toString("base64"))).rejects.toMatchObject({ status: 422 });
  });
});
