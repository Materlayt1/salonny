"use client";

import Image from "next/image";
import Link from "next/link";
import { Clock3, Heart, MapPin, Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { Business } from "@/lib/types";
import { cn } from "@/lib/utils";
import { canonicalBusinessPath } from "@/lib/seo";

function formatTRY(value: number) { return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(value); }

export function BusinessCard({ business, horizontal = false, mobileCompact = false, dense = false }: { business: Business; horizontal?: boolean; mobileCompact?: boolean; dense?: boolean }) {
  const [favorite, setFavorite] = useState(false);
  const [userId, setUserId] = useState<string>();
  const [saving, setSaving] = useState(false);
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const router = useRouter();
  const detailHref = canonicalBusinessPath(business);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    void supabase.auth.getUser().then(async ({ data }) => {
      if (!active || !data.user) return;
      setUserId(data.user.id);
      const { count } = await supabase.from("favorites").select("business_id", { count: "exact", head: true }).eq("user_id", data.user.id).eq("business_id", business.id);
      if (active) setFavorite(Boolean(count));
    });
    return () => { active = false; };
  }, [business.id, supabase]);

  async function toggleFavorite() {
    if (!supabase || !userId) { router.push(`/auth/login?next=${encodeURIComponent(detailHref)}`); return; }
    const next = !favorite;
    setFavorite(next); setSaving(true);
    const { error } = next
      ? await supabase.from("favorites").insert({ user_id: userId, business_id: business.id })
      : await supabase.from("favorites").delete().eq("user_id", userId).eq("business_id", business.id);
    setSaving(false);
    if (error) setFavorite(!next);
  }
  return (
    <article className={cn("group overflow-hidden rounded-[18px] border border-[#E8E8EE] bg-white transition hover:-translate-y-0.5 hover:shadow-[0_14px_35px_rgba(35,24,75,.1)]", horizontal && "flex p-3 hover:translate-y-0", mobileCompact && "max-md:min-h-[106px] max-md:rounded-xl max-md:p-1.5", dense && "md:rounded-xl md:p-2") }>
      <Link href={detailHref} className={cn("relative block overflow-hidden bg-[#ECECF1]", horizontal ? "h-[116px] w-[120px] shrink-0 rounded-xl" : "aspect-[1.65]", mobileCompact && "max-md:h-[94px] max-md:w-[100px] max-md:rounded-lg", dense && "md:h-[86px] md:w-[98px] md:rounded-lg") }>
        <Image src={business.image} alt={`${business.name} salon görünümü`} fill className="object-cover transition duration-500 group-hover:scale-[1.03]" sizes={horizontal ? "120px" : "(max-width: 768px) 50vw, 280px"} />
        {business.sponsored && <Badge tone="gray" className="absolute left-2 top-2 bg-white/90">Sponsorlu</Badge>}
      </Link>
      <div className={cn("relative min-w-0 p-3.5", horizontal && "flex flex-1 flex-col py-1 pr-1", mobileCompact && "max-md:pl-2.5 max-md:pr-1 max-md:pt-0.5", dense && "md:py-0 md:pl-3") }>
        <button type="button" aria-label={favorite ? "Favorilerden çıkar" : "Favorilere ekle"} onClick={() => void toggleFavorite()} disabled={saving} className={cn("absolute right-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-full bg-white/95 shadow-sm disabled:opacity-60", mobileCompact && "max-md:right-0 max-md:top-0 max-md:h-7 max-md:w-7 max-md:bg-transparent max-md:shadow-none", dense && "md:right-0 md:top-0 md:h-7 md:w-7 md:bg-transparent md:shadow-none") }>
          <Heart className={cn("h-4 w-4", favorite ? "fill-[#6C4BF4] text-[#6C4BF4]" : "text-[#3F3F46]")} />
        </button>
        <Link href={detailHref} className="block pr-9">
          <h3 className={cn("truncate text-[15px] font-semibold", mobileCompact && "max-md:text-[14px]", dense && "md:text-[13px]")}>{business.name}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-[#777781]">
            {business.reviews > 0 ? <><span className="flex items-center gap-1 font-semibold text-[#27272A]"><Star className="h-3.5 w-3.5 fill-[#F5B942] text-[#F5B942]" /> {business.rating.toFixed(1)}</span><span>({business.reviews})</span><span>·</span></> : <><span className="font-semibold text-[#6C4BF4]">Yeni</span><span>·</span></>}<span>{business.category}</span>
          </div>
          <div className={cn("mt-2 flex items-center justify-between gap-2 text-[11px] text-[#777781]", mobileCompact && "max-md:mt-1", dense && "md:mt-1") }>
            <span className="flex min-w-0 items-center gap-1 truncate"><MapPin className="h-3 w-3" /> {business.district}</span>
            {business.distance !== null && <span className="shrink-0">{business.distance} km</span>}
          </div>
        </Link>
        <div className={cn("mt-3 flex items-center justify-between", horizontal && "mt-auto", mobileCompact && "max-md:mt-1.5") }>
          <Badge className={cn(mobileCompact && "max-md:max-w-[130px] max-md:truncate max-md:px-1.5 max-md:py-1 max-md:text-[9px]", dense && "md:max-w-[155px] md:truncate md:px-1.5 md:py-1 md:text-[9px]")}><Clock3 className={cn("mr-1 h-3 w-3", mobileCompact && "max-md:hidden", dense && "md:hidden")} /> {business.nextAvailable}</Badge>
          <strong className="text-xs">{business.startingPrice > 0 ? `${formatTRY(business.startingPrice)}+` : "Fiyatı gör"}</strong>
        </div>
      </div>
    </article>
  );
}
