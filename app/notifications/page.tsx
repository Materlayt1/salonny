import { MobileNav } from "@/components/mobile-nav";
import { NotificationsClient, type NotificationItem } from "@/components/notifications-client";
import { SiteHeader } from "@/components/site-header";
import { createServerClientOptional } from "@/lib/supabase/server";

export default async function NotificationsPage() {
  const supabase = await createServerClientOptional();
  const { data } = supabase ? await supabase.from("notifications").select("id,type,title,body,read_at,created_at").order("created_at", { ascending: false }).limit(100) : { data: [] };
  const notifications: NotificationItem[] = (data ?? []).map((item) => ({ id: item.id, type: item.type, title: item.title, body: item.body, readAt: item.read_at, createdAt: item.created_at }));
  return <><SiteHeader search /><main className="container-shell min-h-[72vh] py-8 pb-28 md:py-12"><NotificationsClient initialNotifications={notifications} /></main><MobileNav /></>;
}
