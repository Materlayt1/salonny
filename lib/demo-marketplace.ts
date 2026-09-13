import "server-only";

import type { Business, Category, PublicBusinessHour, Service } from "@/lib/types";

export function isDevelopmentDemoEnabled() {
  return process.env.NODE_ENV === "development" && process.env.ENABLE_DEMO_DATA !== "false";
}

export const DEMO_CATEGORIES: Category[] = [
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

const hours: PublicBusinessHour[] = Array.from({ length: 7 }, (_, weekday) => ({
  weekday,
  opensAt: weekday === 6 ? "10:00" : "09:00",
  closesAt: weekday === 6 ? "18:00" : "20:00",
  closed: false,
}));
const todayHours = hours[(new Date().getDay() + 6) % 7];

function service(id: string, name: string, price: number, duration: number, description: string): Service {
  return { id, name, price, duration, description, category: "Hizmet" };
}

export const DEMO_BUSINESSES: Business[] = [
  {
    id: "10000000-0000-4000-8000-000000000001",
    branchId: "20000000-0000-4000-8000-000000000001",
    slug: "atelier-luna-nisantasi",
    name: "Atelier Luna Nişantaşı",
    category: "Kuaför",
    rating: 4.9,
    reviews: 284,
    distance: 1.2,
    district: "Şişli",
    city: "İstanbul",
    address: "Teşvikiye Mah. Vali Konağı Cad. No: 42, Şişli",
    image: "https://images.unsplash.com/photo-1600948836101-f9ffda59d250?w=1200&auto=format&fit=crop",
    gallery: [
      "https://images.unsplash.com/photo-1600948836101-f9ffda59d250?w=1400&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1560066984-138dadb4c035?w=1400&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=1400&auto=format&fit=crop",
    ],
    open: true,
    nextAvailable: "Bugün 15:30",
    startingPrice: 650,
    verified: true,
    sponsored: true,
    lat: 41.0521,
    lng: 28.9948,
    phone: "+90 212 555 01 01",
    website: "https://example.com",
    description: "Kişiye özel kesim, renklendirme ve profesyonel saç bakımı sunan modern bir şehir salonu.",
    createdAt: "2026-09-10T10:00:00.000Z",
    timezone: "Europe/Istanbul",
    hours,
    todayHours,
    services: [
      service("30000000-0000-4000-8000-000000000001", "Saç Kesimi & Şekillendirme", 850, 60, "Yüz şekline özel kesim ve profesyonel şekillendirme"),
      service("30000000-0000-4000-8000-000000000002", "Balyaj", 3200, 180, "Doğal geçişli, kişiye özel renklendirme"),
      service("30000000-0000-4000-8000-000000000003", "Keratin Bakımı", 1800, 120, "Yoğun nem ve parlaklık bakımı"),
    ],
    employees: [
      { id: "40000000-0000-4000-8000-000000000001", name: "Derya Akın", role: "Saç Tasarım Uzmanı", rating: 4.9, avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400&auto=format&fit=crop", services: ["30000000-0000-4000-8000-000000000001", "30000000-0000-4000-8000-000000000002", "30000000-0000-4000-8000-000000000003"] },
      { id: "40000000-0000-4000-8000-000000000002", name: "Selin Eren", role: "Renklendirme Uzmanı", rating: 4.8, avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&auto=format&fit=crop", services: ["30000000-0000-4000-8000-000000000002", "30000000-0000-4000-8000-000000000003"] },
    ],
    reviewItems: [
      { id: "50000000-0000-4000-8000-000000000001", rating: 5, comment: "Kesim tam istediğim gibi oldu. Salon çok temiz, ekip gerçekten ilgiliydi.", businessReply: "Güzel yorumunuz için çok teşekkür ederiz.", createdAt: "2026-09-11T12:00:00.000Z" },
    ],
  },
  {
    id: "10000000-0000-4000-8000-000000000002",
    branchId: "20000000-0000-4000-8000-000000000002",
    slug: "north-barber-kadikoy",
    name: "North Barber Kadıköy",
    category: "Berber",
    rating: 4.8,
    reviews: 196,
    distance: 2.4,
    district: "Kadıköy",
    city: "İstanbul",
    address: "Caferağa Mah. Moda Cad. No: 18, Kadıköy",
    image: "https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=1200&auto=format&fit=crop",
    gallery: [
      "https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=1400&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1621605815971-fbc98d665033?w=1400&auto=format&fit=crop",
    ],
    open: true,
    nextAvailable: "Bugün 16:00",
    startingPrice: 450,
    verified: true,
    lat: 40.9868,
    lng: 29.0277,
    phone: "+90 216 555 02 02",
    description: "Klasik berberlik geleneğini modern tekniklerle buluşturan, randevulu erkek bakım stüdyosu.",
    createdAt: "2026-09-08T10:00:00.000Z",
    timezone: "Europe/Istanbul",
    hours,
    todayHours,
    services: [
      service("30000000-0000-4000-8000-000000000004", "Saç Kesimi", 550, 45, "Danışmanlık, kesim ve şekillendirme"),
      service("30000000-0000-4000-8000-000000000005", "Saç + Sakal", 850, 60, "Saç kesimi ve sıcak havlu sakal bakımı"),
    ],
    employees: [
      { id: "40000000-0000-4000-8000-000000000003", name: "Emir Yalçın", role: "Master Barber", rating: 4.9, avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&auto=format&fit=crop", services: ["30000000-0000-4000-8000-000000000004", "30000000-0000-4000-8000-000000000005"] },
    ],
    reviewItems: [
      { id: "50000000-0000-4000-8000-000000000002", rating: 5, comment: "Dakik, özenli ve sonuç çok iyi. Randevu sistemi de oldukça pratik.", businessReply: "Tekrar bekleriz, teşekkürler.", createdAt: "2026-09-09T16:30:00.000Z" },
    ],
  },
  {
    id: "10000000-0000-4000-8000-000000000003",
    branchId: "20000000-0000-4000-8000-000000000003",
    slug: "pure-skin-studio-bebek",
    name: "Pure Skin Studio Bebek",
    category: "Güzellik",
    rating: 4.9,
    reviews: 142,
    distance: 3.1,
    district: "Beşiktaş",
    city: "İstanbul",
    address: "Bebek Mah. Cevdet Paşa Cad. No: 71, Beşiktaş",
    image: "https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=1200&auto=format&fit=crop",
    gallery: [
      "https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=1400&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1515377905703-c4788e51af15?w=1400&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1616394584738-fc6e612e71b9?w=1400&auto=format&fit=crop",
    ],
    open: true,
    nextAvailable: "Yarın 10:30",
    startingPrice: 900,
    verified: true,
    lat: 41.0765,
    lng: 29.0435,
    phone: "+90 212 555 03 03",
    description: "Cilt analiziyle başlayan, ihtiyaca göre planlanan yeni nesil bakım ve güzellik uygulamaları.",
    createdAt: "2026-09-07T10:00:00.000Z",
    timezone: "Europe/Istanbul",
    hours,
    todayHours,
    services: [
      service("30000000-0000-4000-8000-000000000006", "Hydrafacial Cilt Bakımı", 1750, 75, "Derinlemesine temizlik, nem ve ışıltı bakımı"),
      service("30000000-0000-4000-8000-000000000007", "Klasik Cilt Bakımı", 900, 60, "Cilt tipine uygun profesyonel bakım"),
    ],
    employees: [
      { id: "40000000-0000-4000-8000-000000000004", name: "Ece Deniz", role: "Cilt Bakım Uzmanı", rating: 4.9, avatar: "https://images.unsplash.com/photo-1551836022-d5d88e9218df?w=400&auto=format&fit=crop", services: ["30000000-0000-4000-8000-000000000006", "30000000-0000-4000-8000-000000000007"] },
    ],
    reviewItems: [
      { id: "50000000-0000-4000-8000-000000000003", rating: 5, comment: "Cilt analizi çok detaylıydı ve işlem sonrasında farkı hemen gördüm.", businessReply: "Deneyiminizi paylaştığınız için teşekkür ederiz.", createdAt: "2026-09-08T11:15:00.000Z" },
    ],
  },
  {
    id: "10000000-0000-4000-8000-000000000004",
    branchId: "20000000-0000-4000-8000-000000000004",
    slug: "muse-nail-lab-bostanci",
    name: "Muse Nail Lab Bostancı",
    category: "Nail",
    rating: 4.7,
    reviews: 118,
    distance: 5.8,
    district: "Kadıköy",
    city: "İstanbul",
    address: "Bostancı Mah. Bağdat Cad. No: 520, Kadıköy",
    image: "https://images.unsplash.com/photo-1604654894610-df63bc536371?w=1200&auto=format&fit=crop",
    gallery: [
      "https://images.unsplash.com/photo-1604654894610-df63bc536371?w=1400&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1607779097040-26e80aa78e66?w=1400&auto=format&fit=crop",
    ],
    open: false,
    nextAvailable: "Yarın 11:00",
    startingPrice: 500,
    verified: true,
    lat: 40.9562,
    lng: 29.0959,
    phone: "+90 216 555 04 04",
    description: "Hijyenik uygulama standartları ve geniş renk seçkisiyle el ve ayak bakım stüdyosu.",
    createdAt: "2026-09-05T10:00:00.000Z",
    timezone: "Europe/Istanbul",
    hours,
    todayHours,
    services: [
      service("30000000-0000-4000-8000-000000000008", "Kalıcı Oje", 650, 60, "Manikür ve kalıcı oje uygulaması"),
      service("30000000-0000-4000-8000-000000000009", "Protez Tırnak", 1100, 105, "Kişiye özel form ve renk uygulaması"),
      service("30000000-0000-4000-8000-000000000010", "Manikür", 500, 45, "Klasik bakım ve şekillendirme"),
    ],
    employees: [
      { id: "40000000-0000-4000-8000-000000000005", name: "Naz Arslan", role: "Nail Artist", rating: 4.8, avatar: "https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?w=400&auto=format&fit=crop", services: ["30000000-0000-4000-8000-000000000008", "30000000-0000-4000-8000-000000000009", "30000000-0000-4000-8000-000000000010"] },
    ],
    reviewItems: [],
  },
  {
    id: "10000000-0000-4000-8000-000000000005",
    branchId: "20000000-0000-4000-8000-000000000005",
    slug: "calm-house-spa-etiler",
    name: "Calm House Spa Etiler",
    category: "Spa",
    rating: 4.8,
    reviews: 87,
    distance: 4.3,
    district: "Beşiktaş",
    city: "İstanbul",
    address: "Etiler Mah. Nispetiye Cad. No: 84, Beşiktaş",
    image: "https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=1200&auto=format&fit=crop",
    gallery: [
      "https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=1400&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1600334089648-b0d9d3028eb2?w=1400&auto=format&fit=crop",
    ],
    open: true,
    nextAvailable: "Bugün 18:30",
    startingPrice: 1400,
    verified: true,
    lat: 41.0769,
    lng: 29.025,
    phone: "+90 212 555 05 05",
    description: "Şehrin temposundan uzaklaşmak için masaj, aromaterapi ve yenilenme ritüelleri.",
    createdAt: "2026-09-03T10:00:00.000Z",
    timezone: "Europe/Istanbul",
    hours,
    todayHours,
    services: [
      service("30000000-0000-4000-8000-000000000011", "İsveç Masajı", 1600, 60, "Rahatlatıcı tam vücut masajı"),
      service("30000000-0000-4000-8000-000000000012", "Aromaterapi Masajı", 1900, 75, "Özel yağlarla gevşeme ve yenilenme"),
      service("30000000-0000-4000-8000-000000000013", "Klasik Hamam Ritüeli", 1400, 60, "Geleneksel kese ve köpük bakımı"),
    ],
    employees: [
      { id: "40000000-0000-4000-8000-000000000006", name: "Lara Kılıç", role: "Masaj Terapisti", rating: 4.8, avatar: "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=400&auto=format&fit=crop", services: ["30000000-0000-4000-8000-000000000011", "30000000-0000-4000-8000-000000000012", "30000000-0000-4000-8000-000000000013"] },
    ],
    reviewItems: [],
  },
];

export function developmentDemoBusinesses(limit = DEMO_BUSINESSES.length) {
  return isDevelopmentDemoEnabled() ? DEMO_BUSINESSES.slice(0, limit) : [];
}

export function developmentDemoBusiness(slug: string) {
  return isDevelopmentDemoEnabled() ? DEMO_BUSINESSES.find((business) => business.slug === slug) ?? null : null;
}

export function developmentDemoCategories() {
  return isDevelopmentDemoEnabled() ? DEMO_CATEGORIES : [];
}
