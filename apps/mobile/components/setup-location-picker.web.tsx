import { useEffect, useRef, useState } from "react";
import type { Map, Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { businessMapStyle } from "@/lib/map";
export type LocationPoint = { latitude: number; longitude: number };
export function SetupLocationPicker({ point, onChange }: { point: LocationPoint | null; onChange: (point: LocationPoint) => void }) {
  const element = useRef<HTMLDivElement>(null); const map = useRef<Map | null>(null); const marker = useRef<Marker | null>(null);
  const chosen = useRef(point); const change = useRef(onChange); const [failed, setFailed] = useState(false);
  useEffect(() => { chosen.current = point; change.current = onChange; }, [point, onChange]);
  useEffect(() => {
    let live = true; let instance: Map | undefined;
    void import("maplibre-gl").then((gl) => {
      if (!live || !element.current) return;
      instance = new gl.Map({ container: element.current, style: businessMapStyle, center: chosen.current ? [chosen.current.longitude, chosen.current.latitude] : [35.24, 38.96], zoom: chosen.current ? 13 : 5, attributionControl: { compact: true } }); map.current = instance;
      marker.current = new gl.Marker({ color: "#6C4BF4" });
      if (chosen.current) marker.current.setLngLat([chosen.current.longitude, chosen.current.latitude]).addTo(instance);
      instance.on("click", (event) => { change.current({ latitude: Number(event.lngLat.lat.toFixed(6)), longitude: Number(event.lngLat.lng.toFixed(6)) }); });
      instance.on("error", () => { if (live) setFailed(true); });
      instance.addControl(new gl.NavigationControl({ showCompass: false }));
    }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; marker.current?.remove(); instance?.remove(); map.current = null; };
  }, []);
  useEffect(() => { if (point && map.current && marker.current) marker.current.setLngLat([point.longitude, point.latitude]).addTo(map.current); else marker.current?.remove(); }, [point]);
  return <div data-testid="setup-location-map" role="region" aria-label="İşletme konumunu haritada seç" style={{ height: 260, position: "relative", borderRadius: 14, overflow: "hidden" }}><div ref={element} style={{ width: "100%", height: "100%" }} />{failed ? <p role="status" style={{ position: "absolute", bottom: 25, background: "white", padding: 8, fontSize: 12 }}>Harita yüklenemedi. Koordinat alanlarını kullanabilirsin.</p> : null}</div>;
}
