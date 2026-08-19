"use client";

import { Crosshair, LoaderCircle, MapPin, Search } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap, Marker } from "maplibre-gl";
import type { GeocodeResult } from "@/lib/geocoding";
import { createSalonnyMapStyle } from "@/lib/map-theme";

type Position = { latitude: number; longitude: number };

export function BusinessLocationPicker({
  initialLatitude,
  initialLongitude,
  initialQuery,
  onAddressSelect,
}: {
  initialLatitude: number;
  initialLongitude: number;
  initialQuery: string;
  onAddressSelect: (result: GeocodeResult) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const [position, setPosition] = useState<Position>({ latitude: initialLatitude, longitude: initialLongitude });
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string>();

  const moveMarker = useCallback((latitude: number, longitude: number, animate = true) => {
    setPosition({ latitude, longitude });
    markerRef.current?.setLngLat([longitude, latitude]);
    if (animate) mapRef.current?.flyTo({ center: [longitude, latitude], zoom: Math.max(mapRef.current.getZoom(), 15), duration: 550 });
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    let disposed = false;
    void import("maplibre-gl").then((maplibregl) => {
      if (disposed || !containerRef.current) return;
      const map = new maplibregl.Map({
        container: containerRef.current,
        center: [initialLongitude, initialLatitude],
        zoom: 14,
        attributionControl: false,
        style: createSalonnyMapStyle(),
        dragRotate: false,
        pitchWithRotate: false,
        maxPitch: 0,
      });
      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
      map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-left");

      const element = document.createElement("div");
      element.className = "salonny-location-marker";
      element.innerHTML = '<span aria-hidden="true"></span>';
      const marker = new maplibregl.Marker({ element, anchor: "bottom", draggable: true })
        .setLngLat([initialLongitude, initialLatitude])
        .addTo(map);
      markerRef.current = marker;
      marker.on("dragend", () => {
        const coordinates = marker.getLngLat();
        setPosition({ latitude: coordinates.lat, longitude: coordinates.lng });
      });
      map.on("click", (event) => moveMarker(event.lngLat.lat, event.lngLat.lng, false));
      map.once("load", () => map.resize());
    });
    return () => {
      disposed = true;
      markerRef.current?.remove();
      markerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [initialLatitude, initialLongitude, moveMarker]);

  async function searchAddress() {
    const normalized = query.trim();
    if (normalized.length < 3) { setError("En az 3 karakterlik bir adres girin."); return; }
    setSearching(true); setError(undefined); setResults([]);
    try {
      const response = await fetch(`/api/geocode?q=${encodeURIComponent(normalized)}`);
      const payload = await response.json() as { results?: GeocodeResult[]; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Adres aranamadı.");
      setResults(payload.results ?? []);
      if (!payload.results?.length) setError("Bu adres için sonuç bulunamadı. Haritada noktayı elle seçebilirsiniz.");
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : "Adres aranamadı.");
    } finally {
      setSearching(false);
    }
  }

  function selectResult(result: GeocodeResult) {
    moveMarker(result.latitude, result.longitude);
    setQuery(result.label);
    setResults([]);
    setError(undefined);
    onAddressSelect(result);
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) { setError("Tarayıcınız konum özelliğini desteklemiyor."); return; }
    setLocating(true); setError(undefined);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => { moveMarker(coords.latitude, coords.longitude); setLocating(false); },
      () => { setError("Konum alınamadı. Tarayıcı konum iznini kontrol edin."); setLocating(false); },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }

  return <div className="grid gap-3">
    <div className="relative flex gap-2">
      <label className="relative flex-1">
        <span className="sr-only">Haritada adres ara</span>
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8A8A94]" />
        <input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void searchAddress(); } }} placeholder="Örn. Kazımdirik Mahallesi, Bornova, İzmir" className="h-12 w-full rounded-xl border border-[#E1E1E7] bg-white pl-10 pr-3 text-sm outline-none focus:border-[#6C4BF4] focus:ring-4 focus:ring-[#6C4BF4]/10" />
      </label>
      <button type="button" onClick={() => void searchAddress()} disabled={searching} className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#15151A] px-4 text-sm font-semibold text-white disabled:opacity-60">
        {searching ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} <span className="hidden sm:inline">Adresi bul</span>
      </button>
    </div>

    {results.length > 0 && <div className="overflow-hidden rounded-xl border border-[#E1E1E7] bg-white shadow-lg">
      {results.map((result) => <button key={result.id} type="button" onClick={() => selectResult(result)} className="flex w-full gap-3 border-b border-[#EEEEF2] px-4 py-3 text-left last:border-0 hover:bg-[#F8F7FF]">
        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#6C4BF4]" /><span className="text-xs leading-5 text-[#4D4D57]">{result.label}</span>
      </button>)}
    </div>}
    {error && <p role="alert" className="text-xs text-[#B42332]">{error}</p>}

    <div className="salonny-map relative h-[330px] overflow-hidden rounded-[22px] border border-[#D9D1FA] bg-[#F3F0FF] shadow-[0_14px_38px_rgba(46,31,105,.1)]">
      <div ref={containerRef} className="h-full w-full" aria-label="İşletme konumu seçme haritası" />
      <button type="button" onClick={useCurrentLocation} disabled={locating} className="absolute right-3 top-3 z-10 inline-flex h-10 items-center gap-2 rounded-xl bg-white px-3 text-xs font-semibold shadow-lg disabled:opacity-60">
        {locating ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Crosshair className="h-4 w-4 text-[#6C4BF4]" />} Konumum
      </button>
      <div className="pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-[#15151A]/90 px-3 py-1.5 text-[10px] font-medium text-white shadow-lg">Haritaya tıkla veya işareti sürükle</div>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#F4F1FF] px-4 py-3 text-xs text-[#5D4BA4]">
      <span><strong>Seçilen nokta:</strong> {position.latitude.toFixed(6)}, {position.longitude.toFixed(6)}</span>
      <span>Açık harita verisi</span>
    </div>
    <input type="hidden" name="latitude" value={position.latitude.toFixed(6)} />
    <input type="hidden" name="longitude" value={position.longitude.toFixed(6)} />
  </div>;
}
