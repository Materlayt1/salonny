import "server-only";

import type { Business, Category, PublicBusinessHour } from "@/lib/types";

// Recovered from Salonny's last successful server cache on 2026-08-25.
// This is a read-only continuity snapshot of real published records, not demo data.
export const LAST_KNOWN_MARKETPLACE_CAPTURED_AT = "2026-08-25T23:56:26+03:00";

const categories: Category[] = [
  { id: "kuafor", name: "Kuaför", icon: "scissors", color: "#EEE6FF" },
  { id: "berber", name: "Berber", icon: "razor", color: "#F2E5FF" },
  { id: "guzellik", name: "Güzellik", icon: "sparkles", color: "#FFE4EF" },
  { id: "nail", name: "Nail", icon: "hand", color: "#EFE5FF" },
  { id: "spa", name: "Spa", icon: "flower", color: "#FFEBDD" },
  { id: "veteriner", name: "Veteriner", icon: "paw", color: "#DFF7EC" },
  { id: "pet-kuaforu", name: "Pet Kuaförü", icon: "dog", color: "#DFF1FF" },
  { id: "fitness", name: "Fitness", icon: "dumbbell", color: "#E2F7F1" },
  { id: "pilates", name: "Pilates", icon: "activity", color: "#E7ECFF" },
  { id: "diger", name: "Diğer", icon: "ellipsis", color: "#F1F1F4" },
];

const firstHours: PublicBusinessHour[] = [
  { weekday: 0, opensAt: "09:00:00", closesAt: "19:00:00", closed: false },
  { weekday: 1, opensAt: "09:00:00", closesAt: "19:00:00", closed: false },
  { weekday: 2, opensAt: "09:00:00", closesAt: "19:00:00", closed: false },
  { weekday: 3, opensAt: "09:00:00", closesAt: "19:00:00", closed: false },
  { weekday: 4, opensAt: "09:00:00", closesAt: "19:00:00", closed: false },
  { weekday: 5, opensAt: null, closesAt: null, closed: true },
  { weekday: 6, opensAt: null, closesAt: null, closed: true },
];

const secondHours: PublicBusinessHour[] = firstHours.map((item) => (
  item.weekday === 5 ? { ...item, opensAt: "09:00:00", closesAt: "19:00:00", closed: false } : item
));

const businesses: Business[] = [
  {
    id: "927b7884-6bb3-4c5b-92c4-4d8fbe29d6b0",
    branchId: "20d387b0-6e98-49a4-9e6e-c056e67b5be7",
    slug: "gogo-cfc189",
    name: "Gogo",
    category: "Diğer",
    rating: 5,
    reviews: 2,
    distance: null,
    district: "Fatih",
    city: "İstanbul",
    address: "İstanbul",
    image: "/recovered/gogo-salonny.webp",
    gallery: ["/recovered/gogo-salonny.webp", "/recovered/gogo-varol.webp"],
    open: false,
    nextAvailable: "Uygun saatleri gör",
    startingPrice: 400,
    verified: true,
    lat: 41.006381,
    lng: 28.975872,
    phone: "05537110686",
    description: "",
    createdAt: "2026-08-18T22:47:36.805099+03:00",
    timezone: "Europe/Istanbul",
    hours: firstHours,
    reviewItems: [
      { id: "3270df82-1c87-4a6e-8c90-938a8da8ad71", rating: 5, comment: "çok iyi baya hem de", businessReply: "", createdAt: "2026-08-25T23:41:27.767753+03:00" },
      { id: "10109b49-0361-409a-a6f1-a06a47e4b23f", rating: 5, comment: "çok iyiydi", businessReply: "", createdAt: "2026-08-25T22:04:49.748171+03:00" },
    ],
    services: [
      { id: "7473491c-95f6-4d14-ab12-5ded6645aca0", name: "kesim", description: "", duration: 35, price: 400, category: "Hizmet" },
    ],
    employees: [
      { id: "21dcff6e-7418-4dc7-b66f-0208eb9a50d1", name: "Doğukan", role: "berber", rating: 0, avatar: "/brand/salonny-mark.png", services: ["7473491c-95f6-4d14-ab12-5ded6645aca0"] },
    ],
  },
  {
    id: "7766eb58-0b1a-44b4-a9ef-622d9ce647e9",
    branchId: "24228757-ede8-4a01-ba16-834854b49527",
    slug: "gogo-6f9371",
    name: "Gogo",
    category: "Kuaför",
    rating: 0,
    reviews: 0,
    distance: null,
    district: "bornova",
    city: "İzmir",
    address: "4712 street no 29 camkule bornova izmir",
    image: "/recovered/gogo-varol.webp",
    gallery: ["/recovered/gogo-varol.webp"],
    open: false,
    nextAvailable: "Uygun saatleri gör",
    startingPrice: 400,
    verified: true,
    lat: 38.4237,
    lng: 27.1428,
    phone: "05537110686",
    description: "",
    createdAt: "2026-08-18T22:50:46.231622+03:00",
    timezone: "Europe/Istanbul",
    hours: secondHours,
    reviewItems: [],
    services: [
      { id: "b90b565c-893e-4456-ad46-d795344476e8", name: "kesim", description: "", duration: 30, price: 400, category: "Hizmet" },
    ],
    employees: [
      { id: "f12d2536-dce8-4eb3-aae9-a14ea61cf733", name: "Doğukan", role: "Uzman", rating: 0, avatar: "/brand/salonny-mark.png", services: ["b90b565c-893e-4456-ad46-d795344476e8"] },
    ],
  },
];

function enabled() {
  return process.env.ENABLE_LAST_KNOWN_MARKETPLACE !== "false";
}

function withCurrentHours(business: Business): Business {
  const localNow = new Date(new Date().toLocaleString("en-US", { timeZone: business.timezone ?? "Europe/Istanbul" }));
  const weekday = (localNow.getDay() + 6) % 7;
  const todayHours = business.hours?.find((item) => item.weekday === weekday);
  const clock = localNow.toTimeString().slice(0, 5);
  const open = Boolean(todayHours && !todayHours.closed && todayHours.opensAt && todayHours.closesAt
    && clock >= todayHours.opensAt.slice(0, 5) && clock < todayHours.closesAt.slice(0, 5));
  return { ...business, todayHours, open };
}

export function lastKnownMarketplaceBusinesses(limit = businesses.length) {
  return enabled() ? businesses.slice(0, limit).map(withCurrentHours) : [];
}

export function lastKnownMarketplaceBusiness(slug: string) {
  if (!enabled()) return null;
  const business = businesses.find((item) => item.slug === slug);
  return business ? withCurrentHours(business) : null;
}

export function lastKnownMarketplaceCategories() {
  return enabled() ? categories : [];
}
