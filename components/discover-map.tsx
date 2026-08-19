"use client";

import { useEffect, useRef } from "react";
import type { GeoJSONSource, Map as MapLibreMap, Marker } from "maplibre-gl";
import { isValidCoordinate } from "@/lib/geo";
import { createSalonnyMapStyle, MAP_PRIMARY, MAP_PRIMARY_DARK, MAP_WHITE } from "@/lib/map-theme";
import type { Business } from "@/lib/types";

const TURKEY_CENTER: [number, number] = [35.24, 38.96];
const sourceId = "marketplace-businesses";

function collection(items: Business[]) {
  return {
    type: "FeatureCollection",
    features: items.filter((item) => isValidCoordinate(item.lat, item.lng)).map((business) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [business.lng, business.lat] },
      properties: { id: business.id, name: business.name },
    })),
  } as unknown as Parameters<GeoJSONSource["setData"]>[0];
}

function fitItems(map: MapLibreMap, items: Business[]) {
  const validItems = items.filter((item) => isValidCoordinate(item.lat, item.lng));
  if (!validItems.length) { map.jumpTo({ center: TURKEY_CENTER, zoom: 5.2 }); return; }
  if (validItems.length === 1) { map.jumpTo({ center: [validItems[0].lng, validItems[0].lat], zoom: 13 }); return; }
  const coordinates = validItems.map((item) => [item.lng, item.lat] as [number, number]);
  const west = Math.min(...coordinates.map(([lng]) => lng)); const east = Math.max(...coordinates.map(([lng]) => lng));
  const south = Math.min(...coordinates.map(([, lat]) => lat)); const north = Math.max(...coordinates.map(([, lat]) => lat));
  map.fitBounds([[west, south], [east, north]], { padding: 68, maxZoom: 13.2, duration: 0 });
}

export function DiscoverMap({ items, selected, onSelect, testId = "discover-map" }: { items: Business[]; selected?: Business; onSelect: (business: Business) => void; testId?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const selectedMarkerRef = useRef<Marker | null>(null);
  const itemsRef = useRef(items);
  const selectedRef = useRef(selected);
  const onSelectRef = useRef(onSelect);

  useEffect(() => { itemsRef.current = items; }, [items]);
  useEffect(() => { selectedRef.current = selected; }, [selected]);
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);

  useEffect(() => {
    if (!containerRef.current) return;
    let disposed = false;
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
      map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-left");
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
      map.addControl(new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: true }), "bottom-right");
      map.on("load", () => {
        if (disposed) return;
        map.addSource(sourceId, { type: "geojson", data: collection(itemsRef.current), cluster: true, clusterMaxZoom: 14, clusterRadius: 46 });
        map.addLayer({ id: "business-cluster-glow", type: "circle", source: sourceId, filter: ["has", "point_count"], paint: { "circle-color": MAP_PRIMARY, "circle-radius": ["step", ["get", "point_count"], 27, 25, 32, 100, 38], "circle-opacity": .16, "circle-blur": .35 } });
        map.addLayer({ id: "business-clusters", type: "circle", source: sourceId, filter: ["has", "point_count"], paint: { "circle-color": MAP_PRIMARY, "circle-radius": ["step", ["get", "point_count"], 18, 25, 22, 100, 27], "circle-stroke-color": MAP_WHITE, "circle-stroke-width": 4 } });
        map.addLayer({ id: "business-cluster-count", type: "symbol", source: sourceId, filter: ["has", "point_count"], layout: { "text-field": ["get", "point_count_abbreviated"], "text-size": 12, "text-font": ["Open Sans Bold"] }, paint: { "text-color": MAP_WHITE } });
        map.addLayer({ id: "business-point-glow", type: "circle", source: sourceId, filter: ["!", ["has", "point_count"]], paint: { "circle-color": MAP_PRIMARY, "circle-radius": 19, "circle-opacity": .15, "circle-blur": .4 } });
        map.addLayer({ id: "business-points", type: "circle", source: sourceId, filter: ["!", ["has", "point_count"]], paint: { "circle-color": MAP_PRIMARY, "circle-radius": 11, "circle-stroke-color": MAP_WHITE, "circle-stroke-width": 4 } });
        map.addLayer({ id: "business-point-core", type: "circle", source: sourceId, filter: ["!", ["has", "point_count"]], paint: { "circle-color": MAP_WHITE, "circle-radius": 3 } });
        map.on("click", "business-clusters", async (event) => {
          const feature = event.features?.[0]; const clusterId = Number(feature?.properties?.point_count ? feature.properties.cluster_id : NaN);
          if (!Number.isFinite(clusterId) || feature?.geometry.type !== "Point") return;
          const zoom = await (map.getSource(sourceId) as GeoJSONSource).getClusterExpansionZoom(clusterId);
          map.easeTo({ center: feature.geometry.coordinates as [number, number], zoom });
        });
        map.on("click", "business-points", (event) => { const id = String(event.features?.[0]?.properties?.id ?? ""); const business = itemsRef.current.find((item) => item.id === id); if (business) onSelectRef.current(business); });
        for (const layer of ["business-clusters", "business-points", "business-point-core"]) { map.on("mouseenter", layer, () => { map.getCanvas().style.cursor = "pointer"; }); map.on("mouseleave", layer, () => { map.getCanvas().style.cursor = ""; }); }

        const markerElement = document.createElement("button");
        markerElement.type = "button";
        markerElement.className = "salonny-selected-marker";
        markerElement.innerHTML = '<span class="salonny-selected-marker-label"></span><span class="salonny-selected-marker-pin"><span></span></span>';
        markerElement.addEventListener("click", () => { const active = selectedRef.current; if (active) onSelectRef.current(active); });
        const active = selectedRef.current ?? itemsRef.current[0];
        if (active && isValidCoordinate(active.lat, active.lng)) {
          markerElement.setAttribute("aria-label", `${active.name} harita işareti`);
          const label = markerElement.querySelector<HTMLElement>(".salonny-selected-marker-label");
          if (label) label.textContent = active.name;
          selectedMarkerRef.current = new maplibregl.Marker({ element: markerElement, anchor: "bottom" }).setLngLat([active.lng, active.lat]).addTo(map);
        }
        fitItems(map, itemsRef.current);
      });
    });
    return () => { disposed = true; selectedMarkerRef.current?.remove(); selectedMarkerRef.current = null; mapRef.current?.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const map = mapRef.current; const source = map?.getSource(sourceId) as GeoJSONSource | undefined;
    if (!map || !source) return;
    source.setData(collection(items)); fitItems(map, items);
  }, [items]);

  useEffect(() => {
    const map = mapRef.current;
    if (map?.getLayer("business-points")) {
      map.setPaintProperty("business-points", "circle-color", ["case", ["==", ["get", "id"], selected?.id ?? ""], MAP_PRIMARY_DARK, MAP_PRIMARY]);
      map.setPaintProperty("business-points", "circle-radius", ["case", ["==", ["get", "id"], selected?.id ?? ""], 14, 11]);
    }
    if (selected && isValidCoordinate(selected.lat, selected.lng)) {
      const marker = selectedMarkerRef.current;
      marker?.setLngLat([selected.lng, selected.lat]);
      const element = marker?.getElement();
      element?.setAttribute("aria-label", `${selected.name} harita işareti`);
      const label = element?.querySelector<HTMLElement>(".salonny-selected-marker-label");
      if (label) label.textContent = selected.name;
    }
  }, [selected]);

  const mappedCount = items.filter((item) => isValidCoordinate(item.lat, item.lng)).length;
  return <div data-testid={testId} className="salonny-map relative h-full w-full overflow-hidden bg-[#F3F0FF]">
    <div ref={containerRef} aria-label="İşletme haritası" className="h-full w-full" />
    <div className="pointer-events-none absolute left-3 top-3 z-10 flex items-center gap-2 rounded-full border border-white/80 bg-white/90 px-3 py-2 text-[10px] font-semibold text-[#4B3B89] shadow-[0_8px_24px_rgba(46,31,105,.12)] backdrop-blur-md sm:left-4 sm:top-4 sm:text-xs">
      <span className="h-2 w-2 rounded-full bg-[#6C4BF4] shadow-[0_0_0_5px_rgba(108,75,244,.12)]" />
      {mappedCount ? `${mappedCount} işletme haritada` : "Harita konumu bekleniyor"}
    </div>
    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[#6C4BF4]/[.05] to-transparent" />
  </div>;
}
