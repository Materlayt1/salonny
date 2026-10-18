"use client";

import { createPortal } from "react-dom";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { ArrowLeft, Check, ChevronDown, ChevronRight, LocateFixed, MapPin, X } from "lucide-react";
import { cityKey, TURKEY_CITIES } from "@salonny/contracts/browse-area";
import { useBrowseArea } from "@/components/use-browse-area";

const subscribe = () => () => {};
export function BrowseAreaPicker({ variant = "header" }: { variant?: "header" | "field" | "compact" }) {
  const ready = useSyncExternalStore(subscribe, () => true, () => false);
  const browse = useBrowseArea();
  const [stage, setStage] = useState<"summary" | "cities" | null>(null);
  const [search, setSearch] = useState("");
  const [requested, setRequested] = useState(false);
  const titleId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const changeButton = useRef<HTMLButtonElement>(null);
  const action = useRef(0);
  const open = stage !== null;
  useEffect(() => {
    if (!open) return;
    const element = dialog.current;
    element?.showModal();
    const opener = trigger.current;
    return () => { element?.close(); opener?.focus({ preventScroll: true }); };
  }, [open]);
  useEffect(() => { if (stage === "cities") searchInput.current?.focus(); else if (stage === "summary") changeButton.current?.focus(); }, [stage]);
  useEffect(() => () => { action.current++; }, []);
  const close = () => { action.current++; setStage(null); setSearch(""); setRequested(false); };
  const choose = (city: string) => { browse.select(city); close(); };
  async function requestPosition() {
    const ticket = ++action.current;
    setRequested(true);
    const granted = await browse.location.requestPosition();
    if (granted && ticket === action.current) choose("auto");
  }
  const cities = TURKEY_CITIES.filter((city) => cityKey(city).includes(cityKey(search)));
  const header = variant === "header";
  const triggerClass = header
    ? "ml-auto flex h-10 min-w-0 max-w-36 shrink-0 items-center gap-1 border-l border-[#E4E4EA] px-2 text-xs text-[#3F3F46] outline-none hover:text-[#6C4BF4] focus-visible:ring-2 focus-visible:ring-[#6C4BF4]"
    : `flex min-h-14 w-full min-w-0 items-center gap-3 rounded-2xl border border-[#E6E0F5] bg-[#FAF9FE] px-3 py-2 text-left text-[#3F3F46] outline-none hover:border-[#C9BEFA] focus-visible:ring-2 focus-visible:ring-[#6C4BF4] ${variant === "compact" ? "text-xs" : "text-sm"}`;
  return <>
    <button ref={trigger} type="button" disabled={!ready} aria-label={`${header ? "Arama bölgesi" : "Şehir seçimi"}: ${browse.label}`} aria-haspopup="dialog" aria-expanded={open} onClick={() => { action.current++; setRequested(false); setStage("summary"); }} className={triggerClass}>
      <MapPin aria-hidden="true" className={`${header ? "h-3.5 w-3.5" : "h-4 w-4"} shrink-0 text-[#6C4BF4]`} />
      <span className="min-w-0 flex-1"><span className="block truncate font-medium">{browse.label}</span>{!header && <span className="mt-0.5 block text-[11px] font-normal text-[#70677C]">Şehri değiştirmek için dokun</span>}</span><ChevronDown aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
    </button>
    {open && ready ? createPortal(<dialog ref={dialog} aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); close(); }} onClick={(event) => { if (event.target === event.currentTarget) close(); }} className="fixed inset-x-0 bottom-0 top-auto mx-auto max-h-[88dvh] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-3xl border-0 bg-white p-0 text-[#27272A] shadow-2xl backdrop:bg-black/35 sm:inset-0 sm:m-auto sm:w-[calc(100%_-_2rem)] sm:rounded-3xl">
      <div className="flex max-h-[88dvh] flex-col gap-4 p-5">
        <div className="flex items-center gap-2">{stage === "cities" && <button type="button" aria-label="Bölge seçeneklerine dön" onClick={() => { action.current++; setSearch(""); setStage("summary"); }} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl hover:bg-[#F8F7FC]"><ArrowLeft className="h-5 w-5" /></button>}<h2 id={titleId} className="flex-1 text-xl font-semibold">{stage === "cities" ? "Şehri değiştir" : "Arama bölgen"}</h2><button type="button" aria-label="Şehir seçimini kapat" onClick={close} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl hover:bg-[#F8F7FC]"><X className="h-5 w-5" /></button></div>
        {stage === "summary" ? <>
          <div className="flex items-center gap-3 rounded-2xl bg-[#FAF9FD] p-4"><MapPin className="h-6 w-6 shrink-0 text-[#6C4BF4]" /><div><p className="text-xs text-[#70677C]">Şu an gösterilen bölge</p><p className="my-1 text-lg font-semibold">{browse.label}</p><p className="text-xs leading-5 text-[#70677C]">{browse.area.radius ? "Yalnız 25 km çevrendeki işletmeler." : browse.area.city ? "Yalnız seçtiğin şehirdeki işletmeler." : "Türkiye genelindeki yayındaki işletmeler."}</p></div></div>
          <button ref={changeButton} type="button" aria-label="Şehri değiştir" onClick={() => setStage("cities")} className="flex min-h-16 items-center gap-3 rounded-2xl border border-[#DCD3FC] p-4 text-left focus-visible:outline-[#6C4BF4]"><MapPin className="h-5 w-5 text-[#6C4BF4]" /><span className="flex-1"><span className="block text-sm font-medium text-[#6C4BF4]">Şehri değiştir</span><span className="mt-1 block text-xs text-[#70677C]">81 şehir arasından seçim yap</span></span><ChevronRight className="h-5 w-5 text-[#6C4BF4]" /></button>
          <button type="button" disabled={browse.location.status === "loading"} onClick={() => void requestPosition()} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#F1EDFF] px-4 text-sm font-medium text-[#6C4BF4] disabled:opacity-60"><LocateFixed className="h-4 w-4" />{browse.location.status === "loading" ? "Konum alınıyor…" : "Konumumu kullan · 25 km"}</button>
          <button type="button" onClick={() => choose("all")} className="min-h-11 rounded-xl px-4 text-sm text-[#70677C] hover:bg-[#FAF9FD]">Tüm şehirleri göster</button>
        </> : <>
          <p className="text-sm text-[#70677C]">İşletmeleri görmek istediğin şehri seç.</p>
          <input ref={searchInput} type="search" aria-label="Şehir ara" placeholder="Şehir ara…" autoComplete="off" value={search} onChange={(event) => setSearch(event.target.value)} className="min-h-12 shrink-0 rounded-xl border border-[#E8E8EE] px-3 text-sm outline-none focus:ring-2 focus:ring-[#6C4BF4]" />
          <div className="grid min-h-0 gap-1 overflow-y-auto overscroll-contain">{cities.map((city) => <button key={city} type="button" aria-pressed={browse.selection === city} onClick={() => choose(city)} className={`flex min-h-12 items-center justify-between rounded-xl px-3 text-left text-sm ${browse.selection === city ? "bg-[#F1EDFF] text-[#6C4BF4]" : "hover:bg-[#FAF9FD]"}`}><span>{city}</span>{browse.selection === city && <Check className="h-4 w-4" />}</button>)}{!cities.length && <div className="p-4 text-center"><p className="text-sm">Şehir bulunamadı</p><button type="button" onClick={() => setSearch("")} className="mt-2 min-h-11 px-3 text-sm text-[#6C4BF4]">Aramayı temizle</button></div>}</div>
        </>}
        {requested && browse.location.error && <p role="alert" className="text-xs text-[#A43A4C]">{browse.location.error}</p>}
        <p className="text-xs leading-5 text-[#70677C]">Seçimin ana sayfa ve keşfette birlikte uygulanır. GPS koordinatları kaydedilmez.</p>
      </div>
    </dialog>, document.body) : null}
  </>;
}
