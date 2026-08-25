"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, MapPin, Star, X } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";
import type { Map as MapLibreMap, Marker } from "maplibre-gl";
import { isValidCoordinate } from "@/lib/geo";
import { createSalonnyMapStyle } from "@/lib/map-theme";
import { canonicalBusinessPath } from "@/lib/seo";
import type { Business } from "@/lib/types";

const TURKEY_CENTER: [number, number] = [35.24, 38.96];
type MapLibreModule = typeof import("maplibre-gl");
type BusinessMarker = { marker: Marker; element: HTMLButtonElement };

function fitItems(map: MapLibreMap, items: Business[]) {
  const validItems = items.filter((item) => isValidCoordinate(item.lat, item.lng));
  if (!validItems.length) { map.jumpTo({ center: TURKEY_CENTER, zoom: 5.2 }); return; }
  if (validItems.length === 1) { map.jumpTo({ center: [validItems[0].lng, validItems[0].lat], zoom: 13 }); return; }
  const coordinates = validItems.map((item) => [item.lng, item.lat] as [number, number]);
  const west = Math.min(...coordinates.map(([lng]) => lng)); const east = Math.max(...coordinates.map(([lng]) => lng));
  const south = Math.min(...coordinates.map(([, lat]) => lat)); const north = Math.max(...coordinates.map(([, lat]) => lat));
  map.fitBounds([[west, south], [east, north]], { padding: 68, maxZoom: 13.2, duration: 0 });
}

export function DiscoverMap({ items, selected, onSelect, onClearSelection, showSelectedCard = false, testId = "discover-map" }: { items: Business[]; selected?: Business; onSelect: (business: Business) => void; onClearSelection?: () => void; showSelectedCard?: boolean; testId?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const maplibreRef = useRef<MapLibreModule | null>(null);
  const markersRef = useRef<Map<string, BusinessMarker>>(new Map());
  const itemsRef = useRef(items);
  const selectedRef = useRef(selected);
  const onSelectRef = useRef(onSelect);

  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);

  const syncMarkers = useCallback(() => {
    const map = mapRef.current;
    const maplibregl = maplibreRef.current;
    if (!map || !maplibregl) return;

    const validItems = itemsRef.current.filter((item) => isValidCoordinate(item.lat, item.lng));
    const validIds = new Set(validItems.map((item) => item.id));

    for (const [id, entry] of markersRef.current) {
      if (validIds.has(id)) continue;
      entry.marker.remove();
      markersRef.current.delete(id);
    }

    for (const business of validItems) {
      let entry = markersRef.current.get(business.id);
      if (!entry) {
        const element = document.createElement("button");
        element.type = "button";
        element.className = "salonny-selected-marker";
        element.innerHTML = '<span class="salonny-selected-marker-label"></span><span class="salonny-selected-marker-pin"><span></span></span>';
        element.addEventListener("click", (event) => {
          event.stopPropagation();
          const current = itemsRef.current.find((item) => item.id === business.id);
          if (current) onSelectRef.current(current);
        });
        const marker = new maplibregl.Marker({ element, anchor: "bottom" })
          .setLngLat([business.lng, business.lat])
          .addTo(map);
        entry = { marker, element };
        markersRef.current.set(business.id, entry);
      }

      const active = business.id === selectedRef.current?.id;
      entry.marker.setLngLat([business.lng, business.lat]);
      entry.element.classList.toggle("is-active", active);
      entry.element.style.zIndex = active ? "2" : "1";
      entry.element.setAttribute("aria-label", `${business.name} harita işareti`);
      const label = entry.element.querySelector<HTMLElement>(".salonny-selected-marker-label");
      if (label) label.textContent = business.name;
    }
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    let disposed = false;
    const markers = markersRef.current;
    void import("maplibre-gl").then((maplibregl) => {
      if (disposed || !containerRef.current) return;
      const map = new maplibregl.Map({
        container: containerRef.current,
        center: TURKEY_CENTER,
        zoom: 5.2,
        attributionControl: false,
        style: createSalonnyMapStyle(),
        dragRotate: false,
        pitchWithRotate: false,
        maxPitch: 0,
      });
      mapRef.current = map;
      maplibreRef.current = maplibregl;
      map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-left");
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
      map.addControl(new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: true }), "bottom-right");
      map.on("load", () => {
        if (disposed) return;
        syncMarkers();
        fitItems(map, itemsRef.current);
      });
    });
    return () => {
      disposed = true;
      for (const entry of markers.values()) entry.marker.remove();
      markers.clear();
      mapRef.current?.remove();
      mapRef.current = null;
      maplibreRef.current = null;
    };
  }, [syncMarkers]);

  useEffect(() => {
    itemsRef.current = items;
    const map = mapRef.current;
    if (!map) return;
    syncMarkers();
    fitItems(map, items);
  }, [items, syncMarkers]);

  useEffect(() => {
    selectedRef.current = selected;
    syncMarkers();
    const map = mapRef.current;
    if (map && selected && isValidCoordinate(selected.lat, selected.lng)) {
      map.easeTo({ center: [selected.lng, selected.lat], zoom: Math.max(map.getZoom(), 12.5), offset: [0, -46], duration: 450 });
    }
  }, [selected, syncMarkers]);

  const mappedCount = items.filter((item) => isValidCoordinate(item.lat, item.lng)).length;
  const selectedOnMap = selected && items.some((item) => item.id === selected.id) && isValidCoordinate(selected.lat, selected.lng) ? selected : undefined;
  return <div data-testid={testId} className="salonny-map relative h-full w-full overflow-hidden bg-[#F3F0FF]">
    <div ref={containerRef} aria-label="İşletme haritası" className="h-full w-full" />
    <div className="pointer-events-none absolute left-3 top-3 z-10 flex items-center gap-2 rounded-full border border-white/80 bg-white/90 px-3 py-2 text-[10px] font-semibold text-[#4B3B89] shadow-[0_8px_24px_rgba(46,31,105,.12)] backdrop-blur-md sm:left-4 sm:top-4 sm:text-xs">
      <span className="h-2 w-2 rounded-full bg-[#6C4BF4] shadow-[0_0_0_5px_rgba(108,75,244,.12)]" />
      {mappedCount ? `${mappedCount} işletme haritada` : "Harita konumu bekleniyor"}
    </div>
    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[#6C4BF4]/[.05] to-transparent" />
    {showSelectedCard && selectedOnMap && (
      <article data-testid="map-business-card" className="animate-pop absolute inset-x-3 bottom-3 z-20 overflow-hidden rounded-2xl border border-white/90 bg-white/95 p-2.5 shadow-[0_18px_50px_rgba(37,22,104,.24)] backdrop-blur-xl sm:left-4 sm:right-auto sm:bottom-4 sm:w-[360px] sm:p-3">
        <div className="flex items-center gap-3">
          <Link href={canonicalBusinessPath(selectedOnMap)} className="relative h-[72px] w-[78px] shrink-0 overflow-hidden rounded-xl bg-[#EEEAFB] sm:h-[82px] sm:w-[92px]">
            <Image src={selectedOnMap.image} alt={`${selectedOnMap.name} işletme görünümü`} fill className="object-cover" sizes="92px" />
          </Link>
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-2">
              <Link href={canonicalBusinessPath(selectedOnMap)} className="min-w-0 flex-1">
                <h3 className="truncate text-sm font-bold text-[#1E1933] sm:text-[15px]">{selectedOnMap.name}</h3>
                <div className="mt-1 flex items-center gap-1.5 text-[10px] text-[#756F85] sm:text-[11px]">
                  {selectedOnMap.reviews > 0 ? <><Star className="h-3.5 w-3.5 fill-[#F5B942] text-[#F5B942]" /><strong className="text-[#292333]">{selectedOnMap.rating.toFixed(1)}</strong><span>({selectedOnMap.reviews})</span><span>·</span></> : <><strong className="text-[#6C4BF4]">Yeni</strong><span>·</span></>}
                  <span className="truncate">{selectedOnMap.category}</span>
                </div>
              </Link>
              {onClearSelection && <button type="button" onClick={onClearSelection} aria-label="İşletme kartını kapat" className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#F3F0FB] text-[#655D78] transition hover:bg-[#EAE4FF] hover:text-[#5635E6]"><X className="h-3.5 w-3.5" /></button>}
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-1 truncate text-[10px] text-[#756F85] sm:text-[11px]"><MapPin className="h-3.5 w-3.5 shrink-0 text-[#6C4BF4]" /> {selectedOnMap.district}, {selectedOnMap.city}</span>
              <strong className="shrink-0 text-xs text-[#292333]">{selectedOnMap.startingPrice > 0 ? `₺${selectedOnMap.startingPrice.toLocaleString("tr-TR")}+` : "Fiyatı gör"}</strong>
            </div>
            <Link href={canonicalBusinessPath(selectedOnMap)} className="mt-2 flex h-8 w-full items-center justify-center gap-1.5 rounded-lg bg-[#6C4BF4] text-[11px] font-semibold text-white transition hover:bg-[#5635E6]">İşletmeyi incele <ArrowRight className="h-3.5 w-3.5" /></Link>
          </div>
        </div>
      </article>
    )}
  </div>;
}
