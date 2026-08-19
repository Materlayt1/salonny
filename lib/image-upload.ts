const MAX_IMAGE_EDGE = 2_000;
const TARGET_IMAGE_BYTES = 650 * 1_024;
const WEBP_QUALITIES = [0.9, 0.84, 0.78] as const;

export type OptimizedImage = {
  file: File;
  originalBytes: number;
  optimizedBytes: number;
  width: number;
  height: number;
  changed: boolean;
};

function canvasBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("image_encoding_failed")), "image/webp", quality);
  });
}

function webpName(name: string) {
  const base = name.replace(/\.[^.]+$/, "").toLocaleLowerCase("tr-TR").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "isletme-gorseli";
  return `${base}.webp`;
}

export async function optimizeImageForUpload(source: File): Promise<OptimizedImage> {
  const bitmap = await createImageBitmap(source, { imageOrientation: "from-image" });
  try {
    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    if (source.size <= TARGET_IMAGE_BYTES && scale === 1 && source.type === "image/webp") {
      return { file: source, originalBytes: source.size, optimizedBytes: source.size, width, height, changed: false };
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) throw new Error("canvas_unavailable");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, width, height);

    let optimized = await canvasBlob(canvas, WEBP_QUALITIES[0]);
    for (const quality of WEBP_QUALITIES.slice(1)) {
      if (optimized.size <= TARGET_IMAGE_BYTES) break;
      optimized = await canvasBlob(canvas, quality);
    }

    if (optimized.size >= source.size && scale === 1) {
      return { file: source, originalBytes: source.size, optimizedBytes: source.size, width, height, changed: false };
    }

    const file = new File([optimized], webpName(source.name), { type: "image/webp", lastModified: Date.now() });
    return { file, originalBytes: source.size, optimizedBytes: file.size, width, height, changed: true };
  } finally {
    bitmap.close();
  }
}

export function formatFileSize(bytes: number) {
  if (bytes < 1_024) return `${bytes} B`;
  if (bytes < 1_024 * 1_024) return `${Math.round(bytes / 1_024)} KB`;
  return `${(bytes / (1_024 * 1_024)).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} MB`;
}
