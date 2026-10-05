import { NextResponse } from "next/server";
import { apiRateLimit } from "@/lib/api-security";
import { createRequestClientOptional } from "@/lib/supabase/request";

export async function GET(request: Request) {
  const limited = await apiRateLimit(request, "session-summary", 60, 60_000);
  if (limited) return limited;

  const supabase = await createRequestClientOptional(request);
  if (!supabase) return NextResponse.json({ authenticated: false }, { headers: { "Cache-Control": "private, no-store" } });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ authenticated: false }, { headers: { "Cache-Control": "private, no-store" } });

  const [membership, profile, notifications, favorites] = await Promise.all([
    supabase.from("business_members").select("business_id").eq("user_id", user.id).eq("active", true).limit(1).maybeSingle(),
    supabase.from("users").select("role,city,full_name").eq("id", user.id).maybeSingle(),
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).is("read_at", null),
    supabase.from("favorites").select("business_id").eq("user_id", user.id).limit(500),
  ]);
  const metadataName = profile.data?.full_name ?? user.user_metadata.full_name ?? user.user_metadata.name;
  const displayName = typeof metadataName === "string" && metadataName.trim()
    ? metadataName.trim()
    : user.email?.split("@")[0] ?? "Profilim";

  return NextResponse.json({
    authenticated: true,
    displayName,
    city: profile.data?.city ?? null,
    hasBusiness: Boolean(membership.data?.business_id),
    isAdmin: profile.data?.role === "ADMIN",
    unreadCount: notifications.count ?? 0,
    favoriteBusinessIds: (favorites.data ?? []).map((favorite) => favorite.business_id),
  }, { headers: { "Cache-Control": "private, no-store" } });
}
