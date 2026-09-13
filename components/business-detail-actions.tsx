"use client";

import { Heart, Share2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getSessionSummary, invalidateSessionSummary } from "@/lib/session-summary-client";

export function BusinessDetailActions({ businessId, slug, name }: { businessId: string; slug: string; name: string }) {
  const router = useRouter(); const [authenticated, setAuthenticated] = useState(false); const [favorite, setFavorite] = useState(false); const [saving, setSaving] = useState(false);
  useEffect(() => { let active = true; void getSessionSummary().then((summary) => { if (!active) return; setAuthenticated(summary.authenticated); setFavorite(summary.favoriteBusinessIds?.includes(businessId) ?? false); }); return () => { active = false; }; }, [businessId]);
  async function toggle() { if (!authenticated) { router.push(`/auth/login?next=${encodeURIComponent(`/business/${slug}`)}`); return; } const next = !favorite; setFavorite(next); setSaving(true); const response = await fetch(`/api/favorites/${businessId}`, { method: next ? "POST" : "DELETE" }); setSaving(false); if (!response.ok) setFavorite(!next); else invalidateSessionSummary(); }
  async function share() { const url = window.location.href; if (navigator.share) await navigator.share({ title: name, url }).catch(() => undefined); else await navigator.clipboard.writeText(url).catch(() => undefined); }
  return <div className="flex gap-2"><button disabled={saving} onClick={() => void toggle()} className="grid h-10 w-10 place-items-center rounded-full bg-white/95 shadow" aria-label={favorite ? "Favorilerden çıkar" : "Favoriye ekle"}><Heart className={`h-5 w-5 ${favorite ? "fill-[#6C4BF4] text-[#6C4BF4]" : ""}`} /></button><button onClick={() => void share()} className="grid h-10 w-10 place-items-center rounded-full bg-white/95 shadow" aria-label="Paylaş"><Share2 className="h-5 w-5" /></button></div>;
}
