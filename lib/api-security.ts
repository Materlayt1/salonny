import "server-only";

import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { checkRateLimit, RateLimitUnavailableError } from "@/lib/rate-limit";

type RateLimitOptions = {
  critical?: boolean;
  message?: string;
};

type JsonBodyResult =
  | { ok: true; value: unknown }
  | { ok: false; response: NextResponse };

function errorResponse(error: string, status: number) {
  return NextResponse.json(
    { error },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export function validateMutationOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return null;

  const requestOrigin = new URL(request.url).origin;
  let configuredOrigin = requestOrigin;
  try {
    if (process.env.NEXT_PUBLIC_APP_URL) {
      configuredOrigin = new URL(process.env.NEXT_PUBLIC_APP_URL).origin;
    }
  } catch {
    // A malformed deployment URL must not weaken the same-origin default.
  }

  if (origin === requestOrigin || origin === configuredOrigin) return null;
  return errorResponse("Geçersiz istek kaynağı.", 403);
}

/**
 * Reads JSON through a bounded stream. Content-Length alone is not a safe body
 * limit because chunked requests may omit it or lie about the final size.
 */
export async function readBoundedJson(
  request: Request,
  maxBytes: number,
): Promise<JsonBodyResult> {
  const invalidOrigin = validateMutationOrigin(request);
  if (invalidOrigin) return { ok: false, response: invalidOrigin };

  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) {
    return {
      ok: false,
      response: errorResponse("Yalnızca JSON istekleri desteklenir.", 415),
    };
  }

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (!Number.isFinite(declaredLength) || declaredLength < 0 || declaredLength > maxBytes) {
    return {
      ok: false,
      response: errorResponse("İstek boyutu çok büyük.", 413),
    };
  }

  if (!request.body) {
    return { ok: false, response: errorResponse("Geçersiz JSON isteği.", 400) };
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return {
          ok: false,
          response: errorResponse("İstek boyutu çok büyük.", 413),
        };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, response: errorResponse("İstek gövdesi okunamadı.", 400) };
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return { ok: true, value: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body)) };
  } catch {
    return { ok: false, response: errorResponse("Geçersiz JSON isteği.", 400) };
  }
}

export function rateLimitKeyFromHeaders(headers: Pick<Headers, "get">) {
  const address = headers.get("x-vercel-forwarded-for")
    ?? headers.get("cf-connecting-ip")
    ?? headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? headers.get("x-real-ip")
    ?? "unknown";
  const agent = headers.get("user-agent") ?? "unknown";
  return createHash("sha256").update(`${address}|${agent}`).digest("base64url").slice(0, 32);
}

export async function apiRateLimit(
  request: Request,
  scope: string,
  limit: number,
  windowMs: number,
  options: RateLimitOptions = {},
) {
  try {
    const key = rateLimitKeyFromHeaders(request.headers);
    const rate = await checkRateLimit(`${scope}:${key}`, limit, windowMs, { failClosed: options.critical });
    if (rate.allowed) return null;
    const retryAfter = Math.max(1, Math.ceil((rate.resetAt - Date.now()) / 1000));
    return NextResponse.json(
      { error: options.message ?? "Çok fazla istek gönderdiniz. Lütfen kısa süre sonra tekrar deneyin." },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfter),
          "X-RateLimit-Limit": String(limit),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(Math.ceil(rate.resetAt / 1000)),
        },
      },
    );
  } catch (error) {
    if (!(error instanceof RateLimitUnavailableError)) throw error;
    return NextResponse.json(
      { error: "İşlem güvenliği servisi geçici olarak kullanılamıyor. Lütfen tekrar deneyin." },
      { status: 503, headers: { "Retry-After": "5", "Cache-Control": "no-store" } },
    );
  }
}
