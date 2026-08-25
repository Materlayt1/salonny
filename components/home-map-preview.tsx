"use client";

import Link from "next/link";
import { ArrowRight, MapPin, Star } from "lucide-react";
import { useState } from "react";
import { DiscoverMap } from "@/components/discover-map";
import type { Business } from "@/lib/types";

export function HomeMapPreview({ businesses }: { businesses: Business[] }) {
  const [selected, setSelected] = useState<Business | undefined>(businesses[0]);

  if (!businesses.length) return null;

  return (
    <div className="overflow-hidden rounded-[24px] border border-[#E7E3F6] bg-white shadow-[0_18px_50px_rgba(55,36,135,.1)]">
      <div className="h-[260px] sm:h-[320px] lg:h-[390px]">
        <DiscoverMap items={businesses} selected={selected} onSelect={setSelected} testId="home-map-preview" />
      </div>
      <div className="flex items-center gap-3 border-t border-[#ECE9F7] p-3.5 sm:p-4">
        {selected && <>
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#F0ECFF] font-bold text-[#5B3BE7]">{selected.name.slice(0, 1).toLocaleUpperCase("tr-TR")}</span>
          <div className="min-w-0 flex-1">
            <strong className="block truncate text-sm">{selected.name}</strong>
            <span className="mt-1 flex items-center gap-2 text-[11px] text-[#777781]"><span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {selected.district}</span>{selected.reviews > 0 && <span className="flex items-center gap-1"><Star className="h-3 w-3 fill-[#F5B942] text-[#F5B942]" /> {selected.rating.toFixed(1)}</span>}</span>
          </div>
        </>}
        <Link href="/kesfet" className="flex shrink-0 items-center gap-1 rounded-xl bg-[#6C4BF4] px-3.5 py-2.5 text-xs font-semibold text-white">Haritada keşfet <ArrowRight className="h-3.5 w-3.5" /></Link>
      </div>
    </div>
  );
}
