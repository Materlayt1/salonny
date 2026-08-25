"use client";

import Link from "next/link";
import { ArrowLeft, ChevronDown, List, Map, MapPin, Search, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { BusinessCard } from "@/components/business-card";
import { CategoryGrid } from "@/components/category-grid";
import { DiscoverMap } from "@/components/discover-map";
import { MobileNav } from "@/components/mobile-nav";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import type { Business, Category } from "@/lib/types";
import { seoSlug } from "@/lib/seo";
import { cn } from "@/lib/utils";

function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number) { const radius = 6371; const toRad = (value: number) => value * Math.PI / 180; const dLat = toRad(lat2 - lat1); const dLng = toRad(lng2 - lng1); const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2; return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); }

type DiscoverPageProps = { initialBusinesses?: Business[]; initialCategories?: Category[] };

export default function DiscoverPage({ initialBusinesses, initialCategories }: DiscoverPageProps = {}) {
  const [query, setQuery] = useState("");
  const [businesses, setBusinesses] = useState<Business[]>(initialBusinesses ?? []);
  const [categories, setCategories] = useState<Category[]>(initialCategories ?? []);
  const [loading, setLoading] = useState(!initialBusinesses);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [desktopListOnly, setDesktopListOnly] = useState(false);
  const [mobileView, setMobileView] = useState<"map" | "list">("map");
  const [filterOpen, setFilterOpen] = useState(false);
  const [openNow, setOpenNow] = useState(false);
  const [selected, setSelected] = useState<Business | undefined>(initialBusinesses?.[0]);
  const [sort, setSort] = useState("recommended");
  const [maxDistance, setMaxDistance] = useState(25);
  const [maxPrice, setMaxPrice] = useState(5000);
  const [minRating, setMinRating] = useState(0);
  const [location, setLocation] = useState<{ lat: number; lng: number }>();
  const [locationError, setLocationError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setQuery(params.get("q") ?? "");
      setSelectedCategory(params.get("category") ?? "");
    });
    if (initialBusinesses) {
      return () => { active = false; };
    }
    void Promise.all([fetch("/api/businesses"), fetch("/api/categories")])
      .then(async ([businessResponse, categoryResponse]) => ({ businessResponse, categoryResponse, businessesResult: await businessResponse.json() as { businesses?: Business[] }, categoriesResult: await categoryResponse.json() as { categories?: Category[] } }))
      .then(({ businessResponse, categoryResponse, businessesResult, categoriesResult }) => {
        if (!active || !businessResponse.ok) return;
        const items = businessesResult.businesses ?? [];
        setBusinesses(items);
        setSelected(items[0]);
        if (categoryResponse.ok) setCategories(categoriesResult.categories ?? []);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [initialBusinesses]);

  const filtered = useMemo(() => {
    let result = businesses.map((business) => location ? { ...business, distance: Math.round(distanceKm(location.lat, location.lng, business.lat, business.lng) * 10) / 10 } : business).filter((business) => `${business.name} ${business.category} ${business.services.map((service) => service.name).join(" ")}`.toLocaleLowerCase("tr").includes(query.toLocaleLowerCase("tr")));
    if (selectedCategory) result = result.filter((business) => seoSlug(business.category) === selectedCategory);
    if (openNow) result = result.filter((business) => business.open);
    if (location) result = result.filter((business) => business.distance !== null && business.distance <= maxDistance);
    result = result.filter((business) => business.startingPrice <= maxPrice && business.rating >= minRating);
    if (sort === "distance") result = [...result].sort((a, b) => (a.distance ?? Number.MAX_SAFE_INTEGER) - (b.distance ?? Number.MAX_SAFE_INTEGER));
    if (sort === "rating") result = [...result].sort((a, b) => b.rating - a.rating);
    if (sort === "price") result = [...result].sort((a, b) => a.startingPrice - b.startingPrice);
    return result;
  }, [businesses, query, selectedCategory, openNow, sort, location, maxDistance, maxPrice, minRating]);

  const activeBusiness = filtered.find((business) => business.id === selected?.id) ?? filtered[0];
  const pageTitle = categories.find((item) => item.id === selectedCategory)?.name ?? "Keşfet";

  function locate() { if (!navigator.geolocation) { setLocationError("Tarayıcın konum paylaşımını desteklemiyor."); return; } setLocationError(""); navigator.geolocation.getCurrentPosition((position) => setLocation({ lat: position.coords.latitude, lng: position.coords.longitude }), () => setLocationError("Konum alınamadı. Tarayıcı iznini kontrol et."), { enableHighAccuracy: true, timeout: 10_000, maximumAge: 300_000 }); }

  const results = loading ? (
    <div className="grid gap-2.5">{[1, 2, 3].map((item) => <div key={item} className="h-[106px] animate-pulse rounded-xl bg-white" />)}</div>
  ) : filtered.length ? (
    <div className={cn("grid gap-2.5", desktopListOnly && "mx-auto max-w-5xl sm:grid-cols-2 lg:grid-cols-3")}>
      {filtered.map((business) => (
        <div key={business.id} onMouseEnter={() => setSelected(business)} onFocus={() => setSelected(business)}>
          <BusinessCard business={business} horizontal={!desktopListOnly} mobileCompact dense />
        </div>
      ))}
    </div>
  ) : (
    <div className="grid min-h-44 place-items-center rounded-2xl border border-dashed border-[#D9D4F3] bg-white p-6 text-center">
      <div><Search className="mx-auto h-7 w-7 text-[#A1A1AA]" /><h2 className="mt-3 text-sm font-semibold">Sonuç bulunamadı</h2><p className="mt-1 text-xs leading-5 text-[#777781]">Arama veya filtrelerini değiştirmeyi dene.</p></div>
    </div>
  );

  return (
    <div className="min-h-screen bg-white">
      <div className="hidden md:block"><SiteHeader search /></div>

      <main>
        <div className="md:hidden">
          <header className="flex h-14 items-center justify-between border-b border-[#ECECF1] bg-white px-4">
            <Link href="/" aria-label="Geri" className="grid h-9 w-9 place-items-center rounded-full"><ArrowLeft className="h-5 w-5" /></Link>
            <button type="button" className="flex items-center gap-1 text-base font-bold">{pageTitle}<ChevronDown className="h-4 w-4" /></button>
            <button type="button" onClick={() => setFilterOpen(true)} aria-label="Filtreler" className="grid h-9 w-9 place-items-center rounded-full"><SlidersHorizontal className="h-5 w-5" /></button>
          </header>

          <div className="flex gap-2 overflow-x-auto border-b border-[#ECECF1] bg-white px-4 py-2.5 hide-scrollbar">
            <select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Sırala" className="h-9 shrink-0 rounded-xl border border-[#E3E3E9] bg-white px-3 text-[11px] font-medium outline-none"><option value="recommended">Sırala</option><option value="distance">En yakın</option><option value="rating">En yüksek puan</option><option value="price">En ucuz</option></select>
            <button type="button" onClick={() => setOpenNow((value) => !value)} className={cn("flex h-9 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-[11px] font-medium", openNow ? "border-[#6C4BF4] bg-[#F0ECFF] text-[#5B3BE7]" : "border-[#E3E3E9]")}>Şu an açık</button>
            <button type="button" onClick={locate} className={cn("flex h-9 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-[11px] font-medium", location ? "border-[#6C4BF4] bg-[#F0ECFF] text-[#5B3BE7]" : "border-[#E3E3E9]")}><MapPin className="h-3.5 w-3.5" /> {location ? "Konum açık" : "Konumum"}</button>
            <button type="button" onClick={() => setFilterOpen(true)} className="flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-[#E3E3E9] px-3 text-[11px] font-medium">Filtreler <ChevronDown className="h-3 w-3" /></button>
          </div>

          {mobileView === "map" ? (
            <div>
              <section className="relative h-[330px] overflow-hidden border-b border-[#E5E5EA]">
                <DiscoverMap items={filtered} selected={activeBusiness} onSelect={setSelected} testId="mobile-discover-map" />
                {loading && <div className="absolute inset-0 z-10 animate-pulse bg-[#E9EAE6]" />}
              </section>
              <section className="bg-[#F7F7FA] px-3 py-3">
                <div className="mb-2 flex items-center justify-between px-0.5"><h1 className="text-[13px] font-bold">Yakınındaki işletmeler</h1><span className="text-[10px] text-[#777781]">{filtered.length} sonuç</span></div>
                {results}
              </section>
            </div>
          ) : (
            <section className="min-h-[calc(100vh-174px)] bg-[#F7F7FA] px-3 pb-28 pt-4">
              <div className="mb-3 flex items-center justify-between px-0.5"><div><p className="text-[10px] text-[#8A8A94]">{location ? "Konumuna göre sıralanabilir" : "Yayınlanmış işletmeler"}</p><h1 className="mt-0.5 text-lg font-bold">{pageTitle}</h1></div><span className="text-[10px] text-[#777781]">{loading ? "Yükleniyor" : `${filtered.length} sonuç`}</span></div>
              {results}
            </section>
          )}

          <button type="button" onClick={() => setMobileView((value) => value === "map" ? "list" : "map")} className="fixed bottom-[82px] left-4 right-4 z-40 flex h-12 items-center justify-center gap-2 rounded-xl bg-[#6C4BF4] text-sm font-semibold text-white shadow-[0_12px_28px_rgba(74,44,196,.28)]">
            {mobileView === "map" ? <><List className="h-4 w-4" /> Listeyi göster</> : <><Map className="h-4 w-4" /> Haritayı göster</>}
          </button>
        </div>

        <div className="hidden md:block">
          <div className="border-b border-[#E8E8EE] bg-white py-3"><div className="container-shell"><CategoryGrid categories={categories} compact /></div></div>
          <div className="flex flex-wrap items-center gap-2 border-b border-[#E8E8EE] px-8 py-3">
            <button type="button" onClick={() => setOpenNow((value) => !value)} className={cn("rounded-xl border px-4 py-2 text-xs font-medium", openNow ? "border-[#6C4BF4] bg-[#F0ECFF] text-[#5B3BE7]" : "border-[#E8E8EE] bg-white")}>Şu an açık</button>
            <button type="button" onClick={locate} className={cn("flex items-center gap-2 rounded-xl border px-4 py-2 text-xs font-medium", location ? "border-[#6C4BF4] bg-[#F0ECFF] text-[#5B3BE7]" : "border-[#E8E8EE] bg-white")}><MapPin className="h-3.5 w-3.5" /> {location ? "Konum açık" : "Konumum"}</button>
            {["Mesafe", "Fiyat", "Puan"].map((label) => <button type="button" onClick={() => setFilterOpen(true)} key={label} className="flex items-center gap-2 rounded-xl border border-[#E8E8EE] bg-white px-4 py-2 text-xs font-medium">{label} <ChevronDown className="h-3.5 w-3.5" /></button>)}
            <button type="button" onClick={() => setFilterOpen(true)} className="flex items-center gap-2 rounded-xl border border-[#E8E8EE] bg-white px-4 py-2 text-xs font-medium"><SlidersHorizontal className="h-3.5 w-3.5" /> Filtrele</button>
            <div className="ml-auto flex items-center gap-2"><select value={sort} onChange={(event) => setSort(event.target.value)} className="rounded-xl border border-[#E8E8EE] bg-white px-3 py-2 text-xs font-medium outline-none"><option value="recommended">Önerilen</option><option value="distance">En yakın</option><option value="rating">En yüksek puan</option><option value="price">En ucuz</option></select><button type="button" onClick={() => setDesktopListOnly((value) => !value)} className="grid h-9 w-9 place-items-center rounded-xl border border-[#E8E8EE]">{desktopListOnly ? <Map className="h-4 w-4" /> : <List className="h-4 w-4" />}</button></div>
          </div>
          <div className={cn("grid h-[calc(100vh-178px)] min-h-[620px]", desktopListOnly ? "grid-cols-1" : "grid-cols-[minmax(0,1.55fr)_minmax(380px,.8fr)]")}>
            <section className={cn("overflow-y-auto bg-[#F8F8FA] p-5", !desktopListOnly && "order-2")}><div className="mb-4 flex items-end justify-between"><div><p className="text-[10px] text-[#8A8A94]">{location ? "Konumuna göre sıralanabilir" : "Tüm konumlar"}</p><h1 className="mt-1 text-lg font-bold">Yayınlanmış işletmeler</h1></div><span className="text-[10px] text-[#777781]">{loading ? "Yükleniyor" : `${filtered.length} sonuç`}</span></div>{results}</section>
            {!desktopListOnly && <section className="relative order-1"><DiscoverMap items={filtered} selected={activeBusiness} onSelect={setSelected} testId="desktop-discover-map" /></section>}
          </div>
        </div>
      </main>

      <MobileNav />
      {filterOpen && (
        <div className="fixed inset-0 z-[70] flex justify-end bg-black/35" onClick={() => setFilterOpen(false)}>
          <aside className="h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between"><h2 className="text-xl font-bold">Filtreler</h2><button type="button" onClick={() => setFilterOpen(false)} className="grid h-9 w-9 place-items-center rounded-xl border border-[#E8E8EE]"><X className="h-4 w-4" /></button></div>
            <div className="mt-8 grid gap-7">
              <div><h3 className="text-sm font-semibold">Kategori</h3><div className="mt-3 flex flex-wrap gap-2">{categories.map((category) => <button type="button" key={category.id} onClick={() => setSelectedCategory((value) => value === category.id ? "" : category.id)} className={cn("rounded-xl border px-3 py-2 text-xs", selectedCategory === category.id ? "border-[#6C4BF4] bg-[#F0ECFF] text-[#5B3BE7]" : "border-[#E8E8EE]")}>{category.name}</button>)}</div></div>
              <div><div className="flex justify-between"><h3 className="text-sm font-semibold">Mesafe</h3><span className="text-xs text-[#6C4BF4]">{maxDistance} km</span></div><input type="range" min="1" max="25" value={maxDistance} onChange={(event) => setMaxDistance(Number(event.target.value))} disabled={!location} className="mt-4 w-full accent-[#6C4BF4] disabled:opacity-40" /><button type="button" onClick={locate} className="mt-2 text-xs font-semibold text-[#6C4BF4]">{location ? "Konumu yenile" : "Mesafe için konumumu aç"}</button>{locationError && <p className="mt-2 text-xs text-red-600">{locationError}</p>}</div>
              <div><div className="flex justify-between"><h3 className="text-sm font-semibold">En yüksek başlangıç fiyatı</h3><span className="text-xs text-[#6C4BF4]">{maxPrice.toLocaleString("tr-TR")} TL</span></div><input type="range" min="0" max="5000" step="100" value={maxPrice} onChange={(event) => setMaxPrice(Number(event.target.value))} className="mt-4 w-full accent-[#6C4BF4]" /></div>
              <div><h3 className="text-sm font-semibold">Puan</h3><div className="mt-3 flex gap-2">{[0, 4, 4.5].map((value) => <button type="button" key={value} onClick={() => setMinRating(value)} className={cn("rounded-xl border px-3 py-2 text-xs", minRating === value ? "border-[#6C4BF4] bg-[#F0ECFF] text-[#5B3BE7]" : "border-[#E8E8EE]")}>{value ? `${value}+` : "Tümü"}</button>)}</div></div>
              <label className="flex items-center justify-between text-sm"><span>Şu an açık</span><input type="checkbox" checked={openNow} onChange={(event) => setOpenNow(event.target.checked)} className="h-5 w-5 accent-[#6C4BF4]" /></label>
            </div>
            <div className="sticky bottom-0 mt-10 flex gap-3 border-t border-[#E8E8EE] bg-white pt-4"><Button variant="ghost" className="flex-1" onClick={() => { setSelectedCategory(""); setMaxDistance(25); setMaxPrice(5000); setMinRating(0); setOpenNow(false); }}>Temizle</Button><Button onClick={() => setFilterOpen(false)} className="flex-1">{filtered.length} Sonucu Göster</Button></div>
          </aside>
        </div>
      )}
    </div>
  );
}
