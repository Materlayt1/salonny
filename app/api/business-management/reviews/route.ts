import { NextResponse } from "next/server";
import { z } from "zod";
import { apiRateLimit } from "@/lib/api-security";
import { businessReviewDirectory } from "@/lib/business-review-directory";
import { BusinessAccessError, getBusinessRequestContext } from "@/lib/business-request-context";

const querySchema = z.object({ businessId: z.uuid().optional(), branchId: z.uuid().optional(), offset: z.string().regex(/^\d{1,5}$/).default("0") }).strict();
const reply = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
export async function GET(request: Request) {
  const search = new URL(request.url).searchParams;
  const parsed = querySchema.safeParse(Object.fromEntries(search));
  if (!parsed.success || new Set(search.keys()).size !== [...search.keys()].length) return reply({ error: "Değerlendirme listesinin kapsamını ve sayfasını kontrol et." }, 422);
  const limited = await apiRateLimit(request, "business-review-read", 60, 60_000);
  if (limited) { limited.headers.set("Cache-Control", "private, no-store"); return limited; }
  try {
    const context = await getBusinessRequestContext(request);
    return reply(await businessReviewDirectory(context, Number(parsed.data.offset)));
  } catch (error) {
    return reply({ error: error instanceof BusinessAccessError ? error.message : "Değerlendirmeler alınamadı. Yeniden dene." }, error instanceof BusinessAccessError ? error.status : 503);
  }
}
