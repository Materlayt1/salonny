import { MobileNav } from "@/components/mobile-nav";
import { NotificationsClient } from "@/components/notifications-client";
import { SiteHeader } from "@/components/site-header";
import { createServerClientOptional } from "@/lib/supabase/server";
import { readNotificationPage } from "@/lib/notification-history";
import type { NotificationPage } from "@salonny/contracts";

export default async function NotificationsPage() {
  let page: NotificationPage | undefined;
  let status: "ready" | "guest" | "error" = "error";
  try {
    const supabase = await createServerClientOptional();
    if (supabase) {
      const auth = await supabase.auth.getUser();
      if (auth.error && (auth.error.status === undefined || auth.error.status === 429 || auth.error.status >= 500)) throw auth.error;
      if (!auth.data.user) status = "guest";
      else { page = await readNotificationPage(supabase, auth.data.user.id); status = "ready"; }
    }
  } catch { status = "error"; }
  return <><SiteHeader search /><main className="container-shell min-h-[72vh] py-8 pb-28 md:py-12"><NotificationsClient initialPage={page} initialStatus={status} /></main><MobileNav /></>;
}
