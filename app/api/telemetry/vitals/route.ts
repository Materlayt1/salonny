import { NextResponse } from "next/server";
import { z } from "zod";
import { apiRateLimit } from "@/lib/api-security";
import { emitEvent } from "@/lib/observability";

const metricSchema = z.object({
  id: z.string().min(1).max(160),
  name: z.string().min(1).max(80),
  value: z.number().finite().nonnegative().max(60 * 60 * 1_000),
  delta: z.number().finite().max(60 * 60 * 1_000),
  rating: z.enum(["good", "needs-improvement", "poor"]).optional(),
  navigationType: z.string().max(40).optional(),
  path: z.string().startsWith("/").max(500),
});

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "Geçersiz istek kaynağı." }, { status: 403 });
  if (Number(request.headers.get("content-length") ?? 0) > 4_096) return NextResponse.json({ error: "İstek boyutu çok büyük." }, { status: 413 });
  const limited = await apiRateLimit(request, "web-vitals", 30, 60_000);
  if (limited) return limited;
  const parsed = metricSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Geçersiz performans metriği." }, { status: 422 });

  await emitEvent("info", { event: "web_vital", ...parsed.data });
  return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
