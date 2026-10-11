import { useCallback, useEffect, useRef, useState } from "react";
import type { Map as GLMap, GeoJSONSource, Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { businessBounds, businessFeatures, businessMapStyle, validBusinesses, type BusinessMapProps } from "@/lib/map";
export function BusinessMap({ items, selectedId, onSelect, height = 300 }: BusinessMapProps) {
  const container = useRef<HTMLDivElement>(null); const map = useRef<GLMap | null>(null);
  const glRef = useRef<typeof import("maplibre-gl") | null>(null);
  const markers = useRef(new Map<string, Marker>());
  const itemsRef = useRef(items); const selectRef = useRef(onSelect);
  const [failed, setFailed] = useState(false);
  const syncMarkers = useCallback(() => {
    const current = map.current; const gl = glRef.current; if (!current || !gl) return;
    // Small views get accessible named pins; large views keep GPU clustering.
    const small = itemsRef.current.length <= 24 ? validBusinesses(itemsRef.current) : [];
    const ids = new Set(small.map((item) => item.id));
    for (const [id, marker] of markers.current) if (!ids.has(id)) { marker.remove(); markers.current.delete(id); }
    for (const business of small) if (!markers.current.has(business.id)) {
      const button = document.createElement("button"); button.type = "button"; button.textContent = business.name;
      button.setAttribute("aria-label", `${business.name}, ${business.district} işletmesini seç`);
      Object.assign(button.style, { background: "#6C4BF4", color: "#fff", border: "2px solid #fff", borderRadius: "12px", padding: "7px 10px", fontSize: "11px", fontWeight: "600", cursor: "pointer", boxShadow: "0 3px 10px #33256633" });
      button.onclick = (event) => { event.stopPropagation(); const selected = itemsRef.current.find((item) => item.id === business.id); if (selected) selectRef.current(selected); };
      markers.current.set(business.id, new gl.Marker({ element: button, anchor: "bottom" }).setLngLat([business.lng, business.lat]).addTo(current));
    }
  }, []);
  useEffect(() => { itemsRef.current = items; selectRef.current = onSelect; syncMarkers(); }, [items, onSelect, syncMarkers]);
  useEffect(() => {
    let active = true; let instance: GLMap | undefined;
    void import("maplibre-gl").then((gl) => {
      if (!active || !container.current) return;
      glRef.current = gl;
      instance = new gl.Map({ container: container.current, style: businessMapStyle, center: [35.24, 38.96], zoom: 5.2, attributionControl: { compact: true }, locale: { "NavigationControl.ZoomIn": "Yakınlaştır", "NavigationControl.ZoomOut": "Uzaklaştır", "AttributionControl.ToggleAttribution": "Harita atıfları", "Map.Title": "İşletme haritası" } }); map.current = instance;
      const current = instance;
      current.on("load", () => {
        current.addSource("businesses", { type: "geojson", data: businessFeatures(itemsRef.current), cluster: true, clusterRadius: 44, clusterMaxZoom: 13 });
        current.addLayer({ id: "business-clusters", type: "circle", source: "businesses", filter: ["has", "point_count"], paint: { "circle-color": "#6C4BF4", "circle-radius": 18, "circle-stroke-color": "#fff", "circle-stroke-width": 3 } });
        current.addLayer({ id: "business-pins", type: "circle", source: "businesses", filter: ["!", ["has", "point_count"]], paint: { "circle-color": "#6C4BF4", "circle-radius": 9, "circle-stroke-color": "#fff", "circle-stroke-width": 3 } });
        const bounds = businessBounds(itemsRef.current); const valid = validBusinesses(itemsRef.current);
        if (valid.length === 1) current.jumpTo({ center: [valid[0].lng, valid[0].lat], zoom: 13 }); else if (bounds) current.fitBounds(bounds, { padding: 48, maxZoom: 13, duration: 0 });
        syncMarkers();
      });
      current.on("click", "business-pins", (event) => { const id = event.features?.[0]?.properties?.id; const business = itemsRef.current.find((item) => item.id === id); if (business) selectRef.current(business); });
      current.on("click", "business-clusters", (event) => { const feature = event.features?.[0]; if (!feature || feature.geometry.type !== "Point") return; const coordinates = feature.geometry.coordinates as [number, number]; const clusterId = Number(feature.properties?.cluster_id); void (current.getSource("businesses") as GeoJSONSource).getClusterExpansionZoom(clusterId).then((zoom) => current.easeTo({ center: coordinates, zoom })).catch(() => setFailed(true)); });
      current.on("error", () => { if (active) setFailed(true); });
      current.addControl(new gl.NavigationControl({ showCompass: false }), "top-right");
    }).catch(() => { if (active) setFailed(true); });
    const markerSet = markers.current;
    return () => { active = false; for (const marker of markerSet.values()) marker.remove(); markerSet.clear(); instance?.remove(); map.current = null; glRef.current = null; };
  }, [syncMarkers]);
  useEffect(() => {
    const current = map.current; if (!current?.getSource("businesses")) return;
    (current.getSource("businesses") as GeoJSONSource).setData(businessFeatures(items));
    const valid = validBusinesses(items); const bounds = businessBounds(items);
    if (valid.length === 1) current.jumpTo({ center: [valid[0].lng, valid[0].lat], zoom: 13 }); else if (bounds) current.fitBounds(bounds, { padding: 48, maxZoom: 13, duration: 0 });
  }, [items]);
  useEffect(() => { if (map.current?.getLayer("business-pins")) map.current.setPaintProperty("business-pins", "circle-radius", ["case", ["==", ["get", "id"], selectedId ?? ""], 13, 9]); }, [selectedId]);
  return <div data-testid="business-map" role="region" aria-label="İşletme konumları" style={{ height, borderRadius: 18, overflow: "hidden", position: "relative", background: "#F0ECFF" }}><div ref={container} style={{ width: "100%", height: "100%" }} />{failed ? <div role="status" style={{ position: "absolute", bottom: 32, left: 12, right: 12, background: "#fff", borderRadius: 10, padding: 10, fontSize: 12 }}>Harita bağlantısında sorun var. İşletme listesini kullanabilirsin.</div> : null}</div>;
}
