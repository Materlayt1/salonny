import "server-only";
import sharp from "sharp";
import { createHash } from "node:crypto";
import { BusinessAccessError } from "@/lib/business-request-context";

/** Decode bounded raster data, re-encode and strip EXIF/GPS before public storage. */
export async function prepareBusinessImage(base64: string) {
  const input = Buffer.from(base64, "base64");
  const jpeg = input[0] === 0xff && input[1] === 0xd8 && input[2] === 0xff;
  const png = input.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const webp = input.subarray(0, 4).toString() === "RIFF" && input.subarray(8, 12).toString() === "WEBP";
  if (!input.length || input.length > 2 * 1024 * 1024 || !(jpeg || png || webp) || input.toString("base64") !== base64) throw new BusinessAccessError("En fazla 2 MB geçerli JPG, PNG veya WebP görseli seç.", 422);
  try {
    const image = sharp(input, { limitInputPixels: 4_000_000, failOn: "warning" }).timeout({ seconds: 4 });
    const metadata = await image.metadata();
    if (!metadata.width || !metadata.height || (metadata.pages ?? 1) > 1 || !["jpeg", "png", "webp"].includes(metadata.format ?? "")) throw new Error("Unsupported raster image");
    // No keepMetadata()/withMetadata(): Sharp strips EXIF, GPS, XMP and IPTC.
    const output = await image.rotate().resize(2000, 2000, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
    if (output.length > 2 * 1024 * 1024) throw new Error("Output exceeds limit");
    return { bytes: output, hash: createHash("sha256").update(output).digest("hex") };
  } catch {
    throw new BusinessAccessError("Görsel güvenli biçimde işlenemedi. Daha küçük, tek kareli bir görsel seç.", 422);
  }
}
