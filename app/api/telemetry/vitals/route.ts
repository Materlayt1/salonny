import { NextResponse } from "next/server";
import { z } from "zod";
import { apiRateLimit, readBoundedJson } from "@/lib/api-security";
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
  const body = await readBoundedJson(request, 4_096);
  if (!body.ok) return body.response;
  const limited = await apiRateLimit(request, "web-vitals", 30, 60_000);
  if (limited) return limited;
  const parsed = metricSchema.safeParse(body.value);
  if (!parsed.success) return NextResponse.json({ error: "Geçersiz performans metriği." }, { status: 422 });

  await emitEvent("info", { event: "web_vital", ...parsed.data });
  return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
