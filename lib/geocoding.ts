import "server-only";
import { BRAND } from "@/config/brand";

export type GeocodeResult = {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  addressLine: string;
  district: string;
  city: string;
  postalCode: string;
};

type NominatimAddress = Record<string, string | undefined>;
type NominatimResult = {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  address?: NominatimAddress;
};

type CacheEntry = { expiresAt: number; results: GeocodeResult[] };
const cache = new Map<string, CacheEntry>();
let lastProviderRequestAt = 0;

export class GeocodingBusyError extends Error {}

function firstValue(address: NominatimAddress, keys: string[]) {
  for (const key of keys) if (address[key]) return address[key] ?? "";
  return "";
}

function toResult(item: NominatimResult): GeocodeResult {
  const address = item.address ?? {};
  const road = firstValue(address, ["road", "pedestrian", "residential", "footway"]);
  const number = address.house_number ?? "";
  const neighbourhood = firstValue(address, ["neighbourhood", "quarter", "suburb"]);
  const addressLine = [road, number].filter(Boolean).join(" ") || neighbourhood || item.display_name.split(",")[0]?.trim() || item.display_name;
  return {
    id: String(item.place_id),
    label: item.display_name,
    latitude: Number(item.lat),
    longitude: Number(item.lon),
    addressLine,
    district: firstValue(address, ["town", "county", "state_district", "borough", "suburb", "district"]),
    city: firstValue(address, ["province", "city", "state", "municipality"]),
    postalCode: address.postcode ?? "",
  };
}

export async function searchTurkeyAddress(query: string): Promise<GeocodeResult[]> {
  const normalized = query.trim().toLocaleLowerCase("tr-TR");
  const cached = cache.get(normalized);
  if (cached && cached.expiresAt > Date.now()) return cached.results;

  // Public Nominatim permits at most one request per second per application.
  if (Date.now() - lastProviderRequestAt < 1_100) throw new GeocodingBusyError("Provider rate limit");
  lastProviderRequestAt = Date.now();

  const baseUrl = process.env.GEOCODING_PROVIDER_URL ?? "https://nominatim.openstreetmap.org";
  const url = new URL("search", `${baseUrl.replace(/\/$/, "")}/`);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("countrycodes", "tr");
  url.searchParams.set("limit", "5");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "Accept-Language": "tr-TR,tr;q=0.9",
      Referer: appUrl,
      "User-Agent": process.env.GEOCODING_USER_AGENT ?? `${BRAND.name}/0.1 (${appUrl})`,
    },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`Geocoding provider returned ${response.status}`);
  const results = ((await response.json()) as NominatimResult[])
    .map(toResult)
    .filter((item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude));

  cache.set(normalized, { expiresAt: Date.now() + 24 * 60 * 60 * 1_000, results });
  if (cache.size > 2_500) {
    const now = Date.now();
    for (const [key, value] of cache) if (value.expiresAt <= now) cache.delete(key);
  }
  return results;
}
