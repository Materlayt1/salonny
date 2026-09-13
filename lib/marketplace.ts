import "server-only";

import { unstable_cache } from "next/cache";
import { isValidCoordinate } from "@/lib/geo";
import { lastKnownMarketplaceBusiness, lastKnownMarketplaceBusinesses } from "@/lib/last-known-marketplace";
import { awaitPublicRequest, createPublicSupabaseClientOptional } from "@/lib/supabase/public";
import type { Business } from "@/lib/types";

type DbBusiness = {
  id: string; name: string; slug: string; description: string | null; phone: string | null; website_url: string | null; timezone: string; verified_at: string | null; rating_average: number | string; review_count: number; created_at: string;
  business_categories: { name_tr: string } | { name_tr: string }[] | null;
  branches: { id: string; name: string; is_primary: boolean; active: boolean }[];
  business_locations: { branch_id: string | null; address_line: string; district: string; city: string; latitude: number | string; longitude: number | string }[];
  business_images: { storage_path: string; kind: "logo" | "cover" | "gallery"; sort_order: number }[];
  business_hours: { branch_id: string; weekday: number; opens_at: string | null; closes_at: string | null; is_closed: boolean }[];
  services: { id: string; name: string; description: string | null; duration_minutes: number; price_minor: number; active: boolean }[];
  employees?: { id: string; display_name: string; title: string | null; avatar_path: string | null; active: boolean; employee_services: { service_id: string }[] }[];
  reviews?: { id: string; rating: number; comment: string | null; business_reply: string | null; created_at: string; moderation_status: string }[];
};

const summarySelect = "id,name,slug,description,phone,website_url,timezone,verified_at,rating_average,review_count,created_at,business_categories(name_tr),branches(id,name,is_primary,active),business_locations(branch_id,address_line,district,city,latitude,longitude),business_images(storage_path,kind,sort_order),business_hours(branch_id,weekday,opens_at,closes_at,is_closed),services(id,name,description,duration_minutes,price_minor,active),reviews(id,rating,comment,business_reply,created_at,moderation_status)";
const detailSelect = `${summarySelect},employees(id,display_name,title,avatar_path,active,employee_services(service_id))`;
function first<T>(value: T | T[] | null) { return Array.isArray(value) ? value[0] : value; }
function publicAssetUrl(path: string | null | undefined) { if (!path) return "/brand/salonny-mark.png"; if (/^https?:\/\//.test(path)) return path; const base = process.env.NEXT_PUBLIC_SUPABASE_URL; if (!base) return "/brand/salonny-mark.png"; return `${base}/storage/v1/object/public/business-assets/${path.split("/").map(encodeURIComponent).join("/")}`; }

function toBusiness(row: DbBusiness): Business | null {
  const branch = [...(row.branches ?? [])].sort((a, b) => Number(b.is_primary) - Number(a.is_primary)).find((item) => item.active); if (!branch) return null;
  const location = (row.business_locations ?? []).find((item) => item.branch_id === branch.id) ?? row.business_locations?.[0]; const latitude = Number(location?.latitude); const longitude = Number(location?.longitude); if (!location || !isValidCoordinate(latitude, longitude)) return null;
  const services = (row.services ?? []).filter((item) => item.active).map((item) => ({ id: item.id, name: item.name, description: item.description ?? "", duration: item.duration_minutes, price: item.price_minor / 100, category: "Hizmet" }));
  const employees = (row.employees ?? []).filter((item) => item.active).map((item) => ({ id: item.id, name: item.display_name, role: item.title ?? "Uzman", rating: 0, avatar: publicAssetUrl(item.avatar_path), services: item.employee_services?.map((link) => link.service_id) ?? [] }));
  const images = [...(row.business_images ?? [])].sort((a, b) => (a.kind === "cover" ? -1 : 0) - (b.kind === "cover" ? -1 : 0) || a.sort_order - b.sort_order).map((item) => publicAssetUrl(item.storage_path)); const category = first(row.business_categories)?.name_tr ?? "Hizmet işletmesi";
  const localNow = new Date(new Date().toLocaleString("en-US", { timeZone: row.timezone || "Europe/Istanbul" })); const weekday = (localNow.getDay() + 6) % 7; const hours = (row.business_hours ?? []).filter((item) => item.branch_id === branch.id).map((item) => ({ weekday: item.weekday, opensAt: item.opens_at, closesAt: item.closes_at, closed: item.is_closed })); const todayHours = hours.find((item) => item.weekday === weekday); const clock = localNow.toTimeString().slice(0, 5); const open = Boolean(todayHours && !todayHours.closed && todayHours.opensAt && todayHours.closesAt && clock >= todayHours.opensAt.slice(0, 5) && clock < todayHours.closesAt.slice(0, 5));
  const reviewItems = (row.reviews ?? []).filter((item) => item.moderation_status === "approved").sort((a, b) => b.created_at.localeCompare(a.created_at)).map((item) => ({ id: item.id, rating: item.rating, comment: item.comment ?? "", businessReply: item.business_reply ?? "", createdAt: item.created_at }));
  return { id: row.id, branchId: branch.id, slug: row.slug, name: row.name, category, rating: Number(row.rating_average), reviews: row.review_count, distance: null, district: location.district, city: location.city, address: location.address_line, image: images[0] ?? "/brand/salonny-mark.png", gallery: images.length ? images : ["/brand/salonny-mark.png"], open, nextAvailable: "Uygun saatleri gör", startingPrice: services.length ? Math.min(...services.map((item) => item.price)) : 0, verified: Boolean(row.verified_at), lat: latitude, lng: longitude, phone: row.phone ?? "", website: row.website_url ?? undefined, description: row.description ?? "", createdAt: row.created_at, timezone: row.timezone, todayHours, hours, reviewItems, services, employees };
}

type MarketplaceListResult = { available: boolean; businesses: Business[] };
type MarketplaceDetailResult = { available: boolean; business: Business | null };

const listCached = unstable_cache(async (limit: number): Promise<MarketplaceListResult> => {
  const supabase = createPublicSupabaseClientOptional();
  if (!supabase) return { available: false, businesses: [] };
  const result = await awaitPublicRequest(supabase
    .from("businesses")
    .select(summarySelect)
    .eq("status", "published")
    .order("rating_average", { ascending: false })
    .order("created_at", { referencedTable: "reviews", ascending: false })
    .limit(3, { referencedTable: "reviews" })
    .limit(limit));
  if (!result) {
    console.error(JSON.stringify({ event: "marketplace_list_failed", code: "timeout" }));
    return { available: false, businesses: [] };
  }
  const { data, error } = result;
  if (error) {
    console.error(JSON.stringify({ event: "marketplace_list_failed", code: error.code }));
    return { available: false, businesses: [] };
  }
  return { available: true, businesses: ((data ?? []) as unknown as DbBusiness[]).map(toBusiness).filter((item): item is Business => Boolean(item)) };
}, ["marketplace-businesses-v4"], { revalidate: 60, tags: ["marketplace"] });

const getCached = unstable_cache(async (slug: string): Promise<MarketplaceDetailResult> => {
  const supabase = createPublicSupabaseClientOptional();
  if (!supabase) return { available: false, business: null };
  const result = await awaitPublicRequest(supabase
    .from("businesses")
    .select(detailSelect)
    .eq("slug", slug)
    .eq("status", "published")
    .order("created_at", { referencedTable: "reviews", ascending: false })
    .limit(50, { referencedTable: "reviews" })
    .maybeSingle());
  if (!result) {
    console.error(JSON.stringify({ event: "marketplace_detail_failed", code: "timeout", slug }));
    return { available: false, business: null };
  }
  const { data, error } = result;
  if (error) {
    console.error(JSON.stringify({ event: "marketplace_detail_failed", code: error.code, slug }));
    return { available: false, business: null };
  }
  return { available: true, business: data ? toBusiness(data as unknown as DbBusiness) : null };
}, ["marketplace-business-v4"], { revalidate: 60, tags: ["marketplace"] });

type LocalListEntry = { expiresAt: number; value?: Business[]; pending?: Promise<Business[]> };
const localLists = new Map<number, LocalListEntry>();

export async function listMarketplaceBusinesses(limit = 50) {
  const safeLimit = Math.min(Math.max(limit, 1), 200);
  const now = Date.now();
  const current = localLists.get(safeLimit);
  if (current?.value && current.expiresAt > now) return current.value;
  if (current?.pending) return current.pending;

  const pending = listCached(safeLimit).then((result) => {
    const value = result.available ? result.businesses : lastKnownMarketplaceBusinesses(safeLimit);
    localLists.set(safeLimit, { value, expiresAt: Date.now() + 60_000 });
    return value;
  }).catch((error) => {
    localLists.delete(safeLimit);
    throw error;
  });
  localLists.set(safeLimit, { pending, expiresAt: now + 60_000 });
  return pending;
}
export async function getMarketplaceBusiness(slug: string) {
  if (!/^[a-z0-9-]{2,160}$/.test(slug)) return null;
  const result = await getCached(slug);
  return result.available ? result.business : lastKnownMarketplaceBusiness(slug);
}
