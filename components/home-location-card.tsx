"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Check, LoaderCircle, LocateFixed } from "lucide-react";
import { useBrowserLocation } from "@/components/use-browser-location";

export function HomeLocationCard() {
  const location = useBrowserLocation();
  const router = useRouter();
  const ready = Boolean(location.position);
  const busy = location.status === "loading";
  return (
    <div data-testid="home-location-card" className="absolute bottom-6 left-6 right-6 max-w-[280px] rounded-[22px] border border-white/90 bg-white/95 p-5 shadow-[0_16px_45px_rgba(41,25,75,.14)] backdrop-blur-sm xl:bottom-8 xl:left-8">
      <span className="inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[.12em] text-[#6C4BF4]">
        {ready ? <Check className="h-3.5 w-3.5" /> : <LocateFixed className="h-3.5 w-3.5" />}
        {ready ? "Konumun hazır" : busy ? "Konumun belirleniyor" : "Yakınında keşfet"}
      </span>
      <h2 className="mt-2 text-[16px] font-semibold tracking-[-.02em] text-[#262131]">{ready ? "Sana yakın, sana uygun." : "İyi hizmet, hemen yakında."}</h2>
      <p className="mt-2 text-[12px] leading-5 text-[#6F6A79]" aria-live="polite">
        {ready ? "Konumun alındı. Yakınındaki işletmeleri haritada keşfet." : busy ? "Yaklaşık konumun alınıyor, kısa bir süre bekle." : "Konumunu kullan, çevrendeki işletmeleri ve uygun saatleri keşfet."}
      </p>
      {ready ? (
        <Link href="/kesfet?nearby=1" className="mt-4 flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#6C4BF4] px-3 text-xs font-semibold text-white transition hover:bg-[#5635E6] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6C4BF4]">Yakınımdakileri keşfet <ArrowUpRight className="h-4 w-4" /></Link>
      ) : (
        <button type="button" disabled={busy} onClick={async () => { if (await location.requestPosition()) router.push("/kesfet?nearby=1"); }} className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#6C4BF4] px-3 text-xs font-semibold text-white transition hover:bg-[#5635E6] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6C4BF4] disabled:cursor-wait disabled:opacity-75">
          {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />}
          {busy ? "Konum alınıyor…" : location.error ? "Konumu tekrar dene" : "Konumumu kullan"}
        </button>
      )}
      {location.error ? <><p role="alert" className="mt-3 text-[11px] leading-4 text-[#9F3C55]">{location.error}</p><Link href="/kesfet" className="mt-2 inline-block text-xs font-medium text-[#6C4BF4] underline underline-offset-4">Konumsuz keşfet</Link></> : null}
    </div>
  );
}
