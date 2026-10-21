/** Shared web/native discovery policy. No GPS coordinates are persisted. */
export const TURKEY_CITIES = "Adana|Adıyaman|Afyonkarahisar|Ağrı|Aksaray|Amasya|Ankara|Antalya|Ardahan|Artvin|Aydın|Balıkesir|Bartın|Batman|Bayburt|Bilecik|Bingöl|Bitlis|Bolu|Burdur|Bursa|Çanakkale|Çankırı|Çorum|Denizli|Diyarbakır|Düzce|Edirne|Elazığ|Erzincan|Erzurum|Eskişehir|Gaziantep|Giresun|Gümüşhane|Hakkari|Hatay|Iğdır|Isparta|İstanbul|İzmir|Kahramanmaraş|Karabük|Karaman|Kars|Kastamonu|Kayseri|Kırıkkale|Kırklareli|Kırşehir|Kilis|Kocaeli|Konya|Kütahya|Malatya|Manisa|Mardin|Mersin|Muğla|Muş|Nevşehir|Niğde|Ordu|Osmaniye|Rize|Sakarya|Samsun|Siirt|Sinop|Sivas|Şanlıurfa|Şırnak|Tekirdağ|Tokat|Trabzon|Tunceli|Uşak|Van|Yalova|Yozgat|Zonguldak".split("|");
export const NEARBY_RADIUS_KM = 25;
export type BrowseSelection = "auto" | "all" | string;
export type ApproximatePosition = { lat: number; lng: number };
export type BrowseArea = { city?: string; lat?: number; lng?: number; radius?: number };
export function cityKey(value: string) {
  return value.trim().toLocaleLowerCase("tr-TR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ı/g, "i");
}
export function canonicalCity(value: string) {
  return TURKEY_CITIES.find((city) => cityKey(city) === cityKey(value));
}
export function validBrowseSelection(value: unknown): BrowseSelection {
  return typeof value === "string" ? value === "all" || value === "auto" ? value : canonicalCity(value) ?? "auto" : "auto";
}
export function resolveBrowseArea(selection: BrowseSelection, position: ApproximatePosition | null): BrowseArea {
  const city = canonicalCity(selection);
  if (city) return { city };
  if (selection === "all" || !position || !Number.isFinite(position.lat) || !Number.isFinite(position.lng) || Math.abs(position.lat) > 90 || Math.abs(position.lng) > 180 || (position.lat === 0 && position.lng === 0)) return {};
  return { lat: Math.round(position.lat * 100) / 100, lng: Math.round(position.lng * 100) / 100, radius: NEARBY_RADIUS_KM };
}
export function browseAreaLabel(area: BrowseArea) {
  return area.city ?? (area.radius ? `Yakınımdakiler · ${area.radius} km` : "Tüm şehirler");
}
export function areaQuery(area: BrowseArea) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(area)) if (value !== undefined) params.set(key, String(value));
  return params.toString();
}
export function distanceInKm(a: ApproximatePosition, b: ApproximatePosition) {
  const radians = (v: number) => v * Math.PI / 180;
  const h = Math.sin(radians(b.lat - a.lat) / 2) ** 2 + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(radians(b.lng - a.lng) / 2) ** 2;
  return 6371.0088 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}
export function businessInArea(business: { city: string; lat: number; lng: number }, area: BrowseArea) {
  if (area.city && cityKey(business.city) !== cityKey(area.city)) return false;
  return area.radius === undefined || (area.lat !== undefined && area.lng !== undefined && Number.isFinite(business.lat) && Number.isFinite(business.lng) && distanceInKm({ lat: area.lat, lng: area.lng }, business) <= area.radius);
}
