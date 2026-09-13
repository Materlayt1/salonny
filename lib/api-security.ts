import "server-only";

import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { checkRateLimit, RateLimitUnavailableError } from "@/lib/rate-limit";

type RateLimitOptions = {
  critical?: boolean;
  message?: string;
};

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
