"use client";

import { Heart, Share2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export function BusinessDetailActions({ businessId, slug, name }: { businessId: string; slug: string; name: string }) {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []); const router = useRouter(); const [userId, setUserId] = useState<string>(); const [favorite, setFavorite] = useState(false); const [saving, setSaving] = useState(false);
  useEffect(() => { if (!supabase) return; let active = true; void supabase.auth.getUser().then(async ({ data }) => { if (!active || !data.user) return; setUserId(data.user.id); const { count } = await supabase.from("favorites").select("business_id", { count: "exact", head: true }).eq("user_id", data.user.id).eq("business_id", businessId); if (active) setFavorite(Boolean(count)); }); return () => { active = false; }; }, [businessId, supabase]);
  async function toggle() { if (!supabase || !userId) { router.push(`/auth/login?next=${encodeURIComponent(`/business/${slug}`)}`); return; } const next = !favorite; setFavorite(next); setSaving(true); const { error } = next ? await supabase.from("favorites").insert({ user_id: userId, business_id: businessId }) : await supabase.from("favorites").delete().eq("user_id", userId).eq("business_id", businessId); setSaving(false); if (error) setFavorite(!next); }
  async function share() { const url = window.location.href; if (navigator.share) await navigator.share({ title: name, url }).catch(() => undefined); else await navigator.clipboard.writeText(url).catch(() => undefined); }
  return <div className="flex gap-2"><button disabled={saving} onClick={() => void toggle()} className="grid h-10 w-10 place-items-center rounded-full bg-white/95 shadow" aria-label={favorite ? "Favorilerden çıkar" : "Favoriye ekle"}><Heart className={`h-5 w-5 ${favorite ? "fill-[#6C4BF4] text-[#6C4BF4]" : ""}`} /></button><button onClick={() => void share()} className="grid h-10 w-10 place-items-center rounded-full bg-white/95 shadow" aria-label="Paylaş"><Share2 className="h-5 w-5" /></button></div>;
}
