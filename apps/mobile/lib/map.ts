import type { Business } from "@salonny/contracts";
export type BusinessMapProps = { items: Business[]; selectedId?: string; onSelect: (business: Business) => void; height?: number };
export function validBusinesses(items: Business[]) { return items.filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lng) && Math.abs(item.lat) <= 90 && Math.abs(item.lng) <= 180 && (item.lat !== 0 || item.lng !== 0)); }
export function businessFeatures(items: Business[]) { return { type: "FeatureCollection" as const, features: validBusinesses(items).map((item) => ({ type: "Feature" as const, id: item.id, properties: { id: item.id, name: item.name }, geometry: { type: "Point" as const, coordinates: [item.lng, item.lat] } })) }; }
export function businessBounds(items: Business[]): [[number, number], [number, number]] | null {
  const valid = validBusinesses(items); if (!valid.length) return null;
  return [[Math.min(...valid.map((item) => item.lng)), Math.min(...valid.map((item) => item.lat))], [Math.max(...valid.map((item) => item.lng)), Math.max(...valid.map((item) => item.lat))]];
}
export const businessMapStyle = {
  version: 8 as const,
  sources: { salonny: { type: "raster" as const, tiles: [process.env.EXPO_PUBLIC_MAP_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>' } },
  layers: [{ id: "basemap", type: "raster" as const, source: "salonny", paint: { "raster-saturation": -0.14, "raster-contrast": -0.06, "raster-brightness-min": 0.06, "raster-brightness-max": 0.98 } }],
};
