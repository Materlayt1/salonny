import { MobileNav } from "@/components/mobile-nav";
import { NotificationsClient } from "@/components/notifications-client";
import { SiteHeader } from "@/components/site-header";
import { createServerClientOptional } from "@/lib/supabase/server";
import { mapNotification, notificationColumns } from "@/lib/notifications";

export default async function NotificationsPage() {
  const supabase = await createServerClientOptional();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  const { data } = supabase && user ? await supabase.from("notifications").select(notificationColumns).eq("user_id", user.id).order("created_at", { ascending: false }).limit(100) : { data: [] };
  const notifications = (data ?? []).map(mapNotification);
  return <><SiteHeader search /><main className="container-shell min-h-[72vh] py-8 pb-28 md:py-12"><NotificationsClient initialNotifications={notifications} /></main><MobileNav /></>;
}
