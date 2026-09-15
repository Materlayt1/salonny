"use client";

import {
  LoaderCircle,
  MapPin,
  RotateCcw,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { BusinessCard } from "@/components/business-card";
import type { Business, Category } from "@/lib/types";

const PAGE_SIZE = 12;

type FeedResponse = {
  businesses: Business[];
  total: number;
  hasMore: boolean;
  error?: string;
};

export function HomeBusinessFeed({
  initialBusinesses,
  categories,
}: {
  initialBusinesses: Business[];
  categories: Category[];
}) {
  const [businesses, setBusinesses] = useState(initialBusinesses);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [city, setCity] = useState("");
  const [openNow, setOpenNow] = useState(false);
  const [sort, setSort] = useState("recommended");
  const [total, setTotal] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(
    initialBusinesses.length >= PAGE_SIZE,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const requestId = useRef(0);

  const loadPage = useCallback(
    async (offset: number, replace: boolean) => {
      const currentRequest = ++requestId.current;
      setLoading(true);
      setError("");
      const params = new URLSearchParams({
        offset: String(offset),
        limit: String(PAGE_SIZE),
        sort,
      });
      if (query.trim()) params.set("q", query.trim());
      if (category) params.set("category", category);
      if (city.trim()) params.set("city", city.trim());
      if (openNow) params.set("open", "1");

      try {
        const response = await fetch(`/api/businesses?${params.toString()}`);
        const payload = (await response.json()) as FeedResponse;
        if (!response.ok) {
          throw new Error(payload.error ?? "İşletmeler alınamadı.");
        }
        if (currentRequest !== requestId.current) return;
        setBusinesses((current) => {
          if (replace) return payload.businesses;
          const known = new Set(current.map((business) => business.id));
          return [
            ...current,
            ...payload.businesses.filter((business) => !known.has(business.id)),
          ];
        });
        setTotal(payload.total);
        setHasMore(payload.hasMore);
      } catch {
        if (currentRequest === requestId.current) {
          setError("İşletmeler yüklenemedi. Tekrar deneyebilirsin.");
        }
      } finally {
        if (currentRequest === requestId.current) setLoading(false);
      }
    },
    [category, city, openNow, query, sort],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => void loadPage(0, true), 300);
    return () => window.clearTimeout(timer);
  }, [loadPage]);

  function resetFilters() {
    setQuery("");
    setCategory("");
    setCity("");
    setOpenNow(false);
    setSort("recommended");
  }

  const filtersActive = Boolean(
    query || category || city || openNow || sort !== "recommended",
  );

  return (
    <div data-testid="home-business-directory">
      <div className="mb-5 rounded-[22px] border border-[#E4DFF4] bg-[#FAF9FF] p-3 shadow-[0_8px_24px_rgba(49,34,104,.05)] md:p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-sm font-semibold text-[#302A45]">
            <SlidersHorizontal className="h-4 w-4 text-[#6C4BF4]" />
            İşletmeleri filtrele
          </span>
          {filtersActive && (
            <button
              type="button"
              onClick={resetFilters}
              className="flex items-center gap-1 text-[11px] font-semibold text-[#6C4BF4]"
            >
              <RotateCcw className="h-3 w-3" /> Temizle
            </button>
          )}
        </div>
        <div className="grid gap-2 md:grid-cols-[1.4fr_1fr_1fr_1fr_auto]">
          <label className="flex h-11 items-center gap-2 rounded-xl border border-[#DDD8EC] bg-white px-3">
            <Search className="h-4 w-4 shrink-0 text-[#8B849C]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="İşletme ara"
              className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-[#9B96A8]"
            />
          </label>
          <select
            aria-label="Kategori filtresi"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className="h-11 rounded-xl border border-[#DDD8EC] bg-white px-3 text-xs outline-none"
          >
            <option value="">Tüm kategoriler</option>
            {categories.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <label className="flex h-11 items-center gap-2 rounded-xl border border-[#DDD8EC] bg-white px-3">
            <MapPin className="h-4 w-4 shrink-0 text-[#8B849C]" />
            <input
              value={city}
              onChange={(event) => setCity(event.target.value)}
              placeholder="Şehir"
              className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-[#9B96A8]"
            />
          </label>
          <select
            aria-label="Sıralama"
            value={sort}
            onChange={(event) => setSort(event.target.value)}
            className="h-11 rounded-xl border border-[#DDD8EC] bg-white px-3 text-xs outline-none"
          >
            <option value="recommended">Önerilen sıralama</option>
            <option value="rating">En yüksek puan</option>
            <option value="newest">En yeni</option>
            <option value="name">İsme göre</option>
          </select>
          <button
            type="button"
            aria-pressed={openNow}
            onClick={() => setOpenNow((current) => !current)}
            className={`h-11 whitespace-nowrap rounded-xl border px-4 text-xs font-semibold transition ${
              openNow
                ? "border-[#6C4BF4] bg-[#6C4BF4] text-white"
                : "border-[#DDD8EC] bg-white text-[#4F4A59]"
            }`}
          >
            Şu an açık
          </button>
        </div>
      </div>

      <div className="mb-3 flex items-center justify-between text-xs text-[#777280]">
        <span>
          {total === null
            ? "Yayındaki işletmeler"
            : `${total.toLocaleString("tr-TR")} işletme`}
        </span>
        {loading && (
          <LoaderCircle className="h-4 w-4 animate-spin text-[#6C4BF4]" />
        )}
      </div>

      {businesses.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {businesses.map((business, index) => (
            <BusinessCard
              key={business.id}
              business={business}
              feed
              priority={index < 2}
            />
          ))}
        </div>
      ) : !loading ? (
        <div className="rounded-[20px] border border-dashed border-[#D9D4F3] bg-white p-8 text-center">
          <Search className="mx-auto h-7 w-7 text-[#9B94B5]" />
          <h3 className="mt-3 text-sm font-semibold">Sonuç bulunamadı</h3>
          <p className="mt-1 text-xs text-[#777280]">
            Filtreleri değiştirerek tekrar deneyebilirsin.
          </p>
        </div>
      ) : null}

      {error && (
        <p className="mt-4 text-center text-xs text-[#C63D4F]">{error}</p>
      )}
      {hasMore && (
        <div className="flex justify-center pt-6">
          <button
            type="button"
            onClick={() => void loadPage(businesses.length, false)}
            disabled={loading}
            className="h-11 rounded-xl border border-[#D8D1F3] bg-white px-6 text-xs font-semibold text-[#5B3BE7] shadow-sm transition hover:bg-[#F6F3FF] disabled:opacity-60"
          >
            {loading ? "Yükleniyor..." : "Daha fazla işletme göster"}
          </button>
        </div>
      )}
    </div>
  );
}
