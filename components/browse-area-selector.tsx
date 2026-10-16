"use client";
import { MapPin } from "lucide-react";
import { useSyncExternalStore } from "react";
import { TURKEY_CITIES } from "@salonny/contracts/browse-area";
import { useBrowseArea } from "@/components/use-browse-area";
const subscribe = () => () => {};
export function BrowseAreaSelector({ compact = false }: { compact?: boolean }) {
  const ready = useSyncExternalStore(subscribe, () => true, () => false);
  const { selection, select, label, location } = useBrowseArea();
  return <div data-testid="browse-area-selector" className={`flex min-w-0 flex-wrap items-center gap-2 ${compact ? "" : "rounded-2xl border border-[#E6E0F5] bg-[#FAF9FE] p-3"}`}>
    <label className="flex min-w-0 flex-1 items-center gap-2 text-xs font-medium text-[#4D4269]">
      <MapPin aria-hidden="true" className="h-4 w-4 shrink-0 text-[#6C4BF4]" />
      <span className="sr-only">Şehir seçimi</span>
      <select aria-label="Şehir seçimi" disabled={!ready} value={selection} onChange={(event) => select(event.target.value)} className="h-10 min-w-0 flex-1 rounded-xl border border-[#DED8EE] bg-white px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-[#6C4BF4]">
        <option value="auto">{location.position ? "Yakınımdakiler · 25 km" : "Şehir seç / konumumu kullan"}</option>
        <option value="all">Tüm şehirler</option>
        {TURKEY_CITIES.map((city) => <option key={city} value={city}>{city}</option>)}
      </select>
    </label>
    <button type="button" disabled={!ready || location.status === "loading"} onClick={() => { void location.requestPosition().then((granted) => { if (granted) select("auto"); }); }} className="min-h-10 rounded-xl px-3 text-xs font-medium text-[#5B3BE7] disabled:opacity-60">{location.status === "loading" ? "Konum alınıyor…" : "Konumumu kullan"}</button>
    {!compact && <p className="w-full text-[11px] leading-5 text-[#70677C]" aria-live="polite">{label}. {selection === "auto" && location.position ? "Yalnız 25 km içindeki işletmeler; diğer şehirler eklenmez." : "Seçimin ana sayfa ve keşfette birlikte uygulanır."}</p>}
    {location.error && <p role="alert" className="w-full text-xs text-[#A43A4C]">{location.error}</p>}
  </div>;
}
