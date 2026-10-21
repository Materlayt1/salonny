import "server-only";
import { revalidatePath, revalidateTag } from "next/cache";

/** Withdrawal is a correctness change: never intentionally serve stale cards. */
export function invalidateMarketplace() {
  revalidateTag("marketplace", { expire: 0 });
  for (const path of ["/", "/kesfet", "/api/businesses", "/api/home-highlights"]) revalidatePath(path);
  revalidatePath("/business/[slug]", "page");
  revalidatePath("/[city]/[district]/[category]/[slug]", "page");
  revalidatePath("/booking/[slug]", "page");
}
