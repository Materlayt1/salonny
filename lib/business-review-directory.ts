import "server-only";
import type { BusinessContext } from "@/lib/business-context";
import { BusinessAccessError } from "@/lib/business-request-context";

export const reviewPageSize = 25;
export type BusinessReviewEntry = { id: string; rating: number; comment: string | null; business_reply: string | null; moderation_status: string; created_at: string };

/** No customer identity, contact details, appointment notes or financial data. */
export async function businessReviewDirectory(context: BusinessContext, offset: number) {
  if (!["OWNER", "MANAGER"].includes(context.role)) throw new BusinessAccessError("Değerlendirmeler için işletme sahibi veya yönetici yetkisi gerekiyor.", 403);
  const { data, error } = await context.supabase.from("reviews")
    .select("id,rating,comment,business_reply,moderation_status,created_at,appointments!inner(branch_id)")
    .eq("business_id", context.business.id).eq("appointments.branch_id", context.branch.id)
    .order("created_at", { ascending: false }).order("id")
    .range(offset, offset + reviewPageSize);
  if (error) throw new BusinessAccessError("Değerlendirmeler alınamadı. Yeniden dene.", 503);
  const rows: BusinessReviewEntry[] = (data ?? []).slice(0, reviewPageSize).map(({ id, rating, comment, business_reply, moderation_status, created_at }) => ({ id, rating, comment, business_reply, moderation_status, created_at }));
  return { rows, hasMore: (data?.length ?? 0) > reviewPageSize };
}
