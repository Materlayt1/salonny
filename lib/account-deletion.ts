import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { invalidateMarketplace } from "@/lib/marketplace-invalidation";
const receipt = z.object({ requested: z.literal(true), requestId: z.uuid(), status: z.enum(["requested", "processing"]), withdrawnBusinessCount: z.number().int().min(0) });
export class AccountDeletionError extends Error {}
export async function requestAccountDeletion(client: SupabaseClient, reason?: string) {
  const result = await client.rpc("request_account_deletion", { p_reason: reason?.trim() || null });
  if (result.error) {
    if (result.error.code === "40001") throw new AccountDeletionError("İşletmenle ilgili başka bir işlem sürüyor. Talep tamamlanmadı; yeniden dene.");
    throw new AccountDeletionError("Silme talebinin sonucu doğrulanamadı. Yeniden denemeden önce profilini yenile.");
  }
  const parsed = receipt.safeParse(result.data);
  if (!parsed.success) throw new AccountDeletionError("Silme talebinin sonucu doğrulanamadı. Profilini yenile.");
  invalidateMarketplace();
  return { requested: true as const, withdrawnBusinessCount: parsed.data.withdrawnBusinessCount };
}
