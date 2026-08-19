import type { Business, Category, Service } from "@/lib/types";

export const DEMO_CATEGORIES: Category[] = [
  { id: "kuafor", name: "Kuaför", icon: "scissors", color: "#EEE6FF" },
  { id: "berber", name: "Berber", icon: "barber", color: "#F2E5FF" },
  { id: "guzellik", name: "Güzellik", icon: "beauty", color: "#FFE4EF" },
  { id: "nail", name: "Nail", icon: "nail", color: "#EFE5FF" },
  { id: "spa", name: "Spa", icon: "spa", color: "#FFEBDD" },
  { id: "veteriner", name: "Veteriner", icon: "paw-print", color: "#DFF7EC" },
  { id: "pet-kuaforu", name: "Pet Kuaförü", icon: "pet-grooming", color: "#DFF1FF" },
  { id: "fitness", name: "Fitness", icon: "dumbbell", color: "#E2F7F1" },
  { id: "pilates", name: "Pilates", icon: "person-standing", color: "#E7ECFF" },
  { id: "diger", name: "Diğer", icon: "ellipsis", color: "#F1F1F4" },
];

type DemoSeed = readonly [
  name: string,
  slug: string,
  category: string,
  district: string,
  image: number,
  startingPrice: number,
  rating: number,
  reviews: number,
  lat: number,
  lng: number,
];

const images = [
  "https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=1200&q=82",
  "https://images.unsplash.com/photo-1503951914875-452162b0f3f1?auto=format&fit=crop&w=1200&q=82",
  "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=1200&q=82",
  "https://images.unsplash.com/photo-1604654894610-df63bc536371?auto=format&fit=crop&w=1200&q=82",
  "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?auto=format&fit=crop&w=1200&q=82",
  "https://images.unsplash.com/photo-1628009368231-7bb7cfcb0def?auto=format&fit=crop&w=1200&q=82",
  "https://images.unsplash.com/photo-1516734212186-a967f81ad0d7?auto=format&fit=crop&w=1200&q=82",
  "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=1200&q=82",
  "https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&w=1200&q=82",
  "https://images.unsplash.com/photo-1595476108010-b4d1f102b1b1?auto=format&fit=crop&w=1200&q=82",
  "https://images.unsplash.com/photo-1599351431202-1e0f0137899a?auto=format&fit=crop&w=1200&q=82",
  "https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?auto=format&fit=crop&w=1200&q=82",
];

const seeds: DemoSeed[] = [
  ["Mor Lale Kuaför", "mor-lale-kuafor", "Kuaför", "Alsancak", 0, 450, 4.9, 284, 38.4382, 27.1434],
  ["Sahil Berber", "sahil-berber", "Berber", "Karşıyaka", 1, 300, 4.8, 196, 38.4554, 27.1203],
  ["Vela Beauty Studio", "vela-beauty-studio", "Güzellik", "Bornova", 2, 550, 4.7, 148, 38.4631, 27.2172],
  ["Narin Nail Bar", "narin-nail-bar", "Nail", "Bostanlı", 3, 400, 4.9, 221, 38.4598, 27.0968],
  ["Armoni Spa", "armoni-spa", "Spa", "Bayraklı", 4, 900, 4.8, 132, 38.4626, 27.1677],
  ["Pati Dost Veteriner", "pati-dost-veteriner", "Veteriner", "Göztepe", 5, 650, 4.9, 317, 38.4013, 27.1011],
  ["Köpük Pet Kuaförü", "kopuk-pet-kuaforu", "Pet Kuaförü", "Mavişehir", 6, 600, 4.7, 94, 38.4928, 27.0435],
  ["Form 35 Fitness", "form-35-fitness", "Fitness", "Balçova", 7, 750, 4.6, 176, 38.3927, 27.0487],
  ["Denge Pilates", "denge-pilates", "Pilates", "Narlıdere", 8, 800, 4.9, 119, 38.3922, 27.0113],
  ["Studio Mira", "studio-mira", "Kuaför", "Konak", 9, 500, 4.8, 205, 38.4189, 27.1287],
  ["Asil Berber", "asil-berber", "Berber", "Buca", 10, 280, 4.6, 163, 38.3874, 27.1741],
  ["İnci Güzellik", "inci-guzellik", "Güzellik", "Güzelyalı", 11, 600, 4.8, 187, 38.3959, 27.0892],
  ["Luna Nails", "luna-nails", "Nail", "Bornova", 3, 420, 4.7, 109, 38.4592, 27.2119],
  ["Ege Masaj Spa", "ege-masaj-spa", "Spa", "Üçkuyular", 4, 950, 4.9, 242, 38.4037, 27.0691],
  ["Minik Patiler Vet", "minik-patiler-vet", "Veteriner", "Karşıyaka", 5, 700, 4.8, 276, 38.4595, 27.1152],
  ["Pofuduk Pet Care", "pofuduk-pet-care", "Pet Kuaförü", "Bornova", 6, 550, 4.6, 88, 38.4664, 27.2218],
  ["Kuzey Gym", "kuzey-gym", "Fitness", "Çiğli", 7, 650, 4.7, 154, 38.4932, 27.0614],
  ["CoreLab Pilates", "corelab-pilates", "Pilates", "Bayraklı", 8, 850, 4.9, 137, 38.4584, 27.1745],
  ["Lavanta Kuaför", "lavanta-kuafor", "Kuaför", "Urla", 0, 480, 4.7, 126, 38.3228, 26.7657],
  ["Rota Berber", "rota-berber", "Berber", "Gaziemir", 1, 320, 4.8, 171, 38.3239, 27.1292],
  ["Işıl Beauty", "isil-beauty", "Güzellik", "Alsancak", 2, 700, 4.9, 309, 38.4367, 27.1422],
  ["Mimoza Nail", "mimoza-nail", "Nail", "Karşıyaka", 3, 390, 4.6, 77, 38.4568, 27.1114],
  ["Aura Wellness", "aura-wellness", "Spa", "Bornova", 4, 1_050, 4.8, 165, 38.4621, 27.2097],
  ["CanVet", "canvet", "Veteriner", "Balçova", 5, 625, 4.7, 214, 38.3948, 27.0548],
  ["Pati Stil", "pati-stil", "Pet Kuaförü", "Göztepe", 6, 575, 4.9, 101, 38.3996, 27.0957],
  ["FitBorn", "fitborn", "Fitness", "Bornova", 7, 700, 4.8, 193, 38.4679, 27.2161],
  ["Nefes Pilates", "nefes-pilates", "Pilates", "Güzelyalı", 8, 780, 4.7, 113, 38.3978, 27.0874],
  ["Zeytin Dalı Kuaför", "zeytin-dali-kuafor", "Kuaför", "Seferihisar", 9, 430, 4.6, 82, 38.1967, 26.8397],
  ["Kordon Berber", "kordon-berber", "Berber", "Alsancak", 10, 350, 4.9, 268, 38.4395, 27.1377],
  ["Vera Güzellik", "vera-guzellik", "Güzellik", "Mavişehir", 11, 650, 4.8, 144, 38.4935, 27.0469],
  ["Gloss Nail Atelier", "gloss-nail-atelier", "Nail", "Alsancak", 3, 475, 4.9, 198, 38.4372, 27.1458],
  ["Mavi Spa", "mavi-spa", "Spa", "Çeşme", 4, 1_200, 4.8, 121, 38.3242, 26.3032],
  ["Yaşam Veteriner", "yasam-veteriner", "Veteriner", "Buca", 5, 600, 4.6, 179, 38.3861, 27.1725],
  ["Dört Pati Kuaför", "dort-pati-kuafor", "Pet Kuaförü", "Narlıdere", 6, 625, 4.7, 92, 38.3934, 27.0158],
  ["Atlas Fitness", "atlas-fitness", "Fitness", "Konak", 7, 800, 4.8, 233, 38.4175, 27.1326],
];

const serviceTemplates: Record<string, readonly [string, string, number, number][]> = {
  "Kuaför": [["Kesim ve fön", "Kişiye özel kesim ve profesyonel fön.", 60, 1], ["Saç boyama", "Renk danışmanlığı ve uygulama.", 120, 2], ["Bakım", "Yoğun nem ve parlaklık bakımı.", 45, .8]],
  "Berber": [["Saç kesimi", "Yüz tipine uygun modern kesim.", 40, 1], ["Sakal tasarımı", "Sıcak havlu ve sakal şekillendirme.", 30, .7], ["Damat paketi", "Özel gün bakım paketi.", 90, 2.3]],
  "Güzellik": [["Cilt bakımı", "Cilt tipine özel profesyonel bakım.", 60, 1], ["Kaş tasarımı", "Doğal görünümü koruyan şekillendirme.", 30, .55], ["Kirpik lifting", "Uzun süre kalıcı lifting uygulaması.", 60, 1.2]],
  "Nail": [["Kalıcı oje", "Manikür dahil kalıcı oje uygulaması.", 60, 1], ["Protez tırnak", "Doğal görünümlü protez tırnak.", 100, 1.8], ["Nail art", "Seçili tasarım uygulaması.", 30, .6]],
  "Spa": [["Aromaterapi masajı", "Rahatlatıcı aromatik yağlarla masaj.", 60, 1], ["Derin doku masajı", "Kas gerginliğine odaklı bakım.", 75, 1.35], ["Spa ritüeli", "Masaj ve vücut bakımı paketi.", 120, 2.1]],
  "Veteriner": [["Genel muayene", "Dostunuz için kapsamlı sağlık kontrolü.", 30, 1], ["Aşı uygulaması", "Yaşa uygun aşı planı ve uygulama.", 20, 1.25], ["Tırnak bakımı", "Güvenli tırnak kesimi ve kontrol.", 20, .5]],
  "Pet Kuaförü": [["Yıkama ve tarama", "Tüy tipine uygun bakım paketi.", 75, 1], ["Makas tıraşı", "Irka ve tüy yapısına uygun tıraş.", 100, 1.5], ["Tırnak ve pati bakımı", "Nazik pati bakım uygulaması.", 25, .45]],
  "Fitness": [["Birebir antrenman", "Hedefe özel kişisel antrenman.", 60, 1], ["Fonksiyonel antrenman", "Kuvvet ve kondisyon odaklı ders.", 50, .8], ["Vücut analizi", "Ölçüm ve program danışmanlığı.", 30, .45]],
  "Pilates": [["Reformer pilates", "Birebir reformer dersi.", 50, 1], ["Düet pilates", "İki kişilik reformer dersi.", 50, .75], ["Postür analizi", "Duruş değerlendirmesi ve programlama.", 30, .5]],
};

const staffNames = ["Ece Yalın", "Deniz Aras", "Selin Ekin", "Mert Sarp", "Duru Acar", "Bora Ege"];
const hours = Array.from({ length: 7 }, (_, weekday) => ({ weekday, opensAt: weekday === 6 ? null : "09:00:00", closesAt: weekday === 6 ? null : "20:00:00", closed: weekday === 6 }));
const galleryImageIndexes: Record<string, number[]> = {
  "Kuaför": [0, 9, 2],
  "Berber": [1, 10, 0],
  "Güzellik": [2, 11, 3],
  "Nail": [3, 11, 2],
  "Spa": [4, 11, 2],
  "Veteriner": [5, 6, 5],
  "Pet Kuaförü": [6, 5, 6],
  "Fitness": [7, 8, 7],
  "Pilates": [8, 7, 8],
};

function servicesFor(seed: DemoSeed): Service[] {
  const [, slug, category, , , startingPrice] = seed;
  return (serviceTemplates[category] ?? serviceTemplates["Güzellik"]).map(([name, description, duration, multiplier], serviceIndex) => ({
    id: `${slug}-service-${serviceIndex + 1}`,
    name,
    description,
    duration,
    price: Math.round(startingPrice * multiplier / 25) * 25,
    category,
  }));
}

export const DEMO_BUSINESSES: Business[] = seeds.map((seed, index) => {
  const [name, slug, category, district, imageIndex, startingPrice, rating, reviews, lat, lng] = seed;
  const services = servicesFor(seed);
  const image = images[imageIndex % images.length];
  const gallery = (galleryImageIndexes[category] ?? [imageIndex]).map((galleryIndex) => images[galleryIndex]);
  const employee = staffNames[index % staffNames.length];
  return {
    id: `demo-business-${String(index + 1).padStart(2, "0")}`,
    branchId: `demo-branch-${String(index + 1).padStart(2, "0")}`,
    slug,
    name,
    category,
    rating,
    reviews,
    distance: Math.round((.4 + (index * .73) % 8.8) * 10) / 10,
    district,
    city: "İzmir",
    address: `${district} Mahallesi, ${120 + index}. Sokak No:${(index % 18) + 1}`,
    image,
    gallery,
    open: index % 5 !== 0,
    nextAvailable: index % 4 === 0 ? "Bugün 18:30" : index % 4 === 1 ? "Yarın 10:00" : index % 4 === 2 ? "Bugün 16:00" : "Yarın 11:30",
    startingPrice,
    verified: index % 4 !== 2,
    sponsored: index === 0 || index === 4,
    lat,
    lng,
    phone: "",
    description: `${name}, ${district} bölgesinde özenli ${category.toLocaleLowerCase("tr-TR")} hizmetleri sunan kurgusal bir demo işletmesidir.`,
    timezone: "Europe/Istanbul",
    todayHours: hours[2],
    hours,
    reviewItems: [
      { id: `${slug}-review-1`, rating: 5, comment: "Çok ilgili ve özenli bir ekipti, tekrar geleceğim.", businessReply: "Güzel yorumunuz için teşekkür ederiz.", createdAt: "2026-08-10T12:00:00.000Z" },
      { id: `${slug}-review-2`, rating: Math.max(4, Math.round(rating)), comment: "Randevu saatinde başladı, ortam temiz ve rahattı.", businessReply: "Sizi yeniden ağırlamayı bekliyoruz.", createdAt: "2026-07-28T09:30:00.000Z" },
    ],
    services,
    employees: [
      { id: `${slug}-employee-1`, name: employee, role: "Kıdemli Uzman", rating, avatar: "/brand/salonny-mark.png", services: services.map((service) => service.id) },
      { id: `${slug}-employee-2`, name: staffNames[(index + 2) % staffNames.length], role: "Uzman", rating: Math.max(4.5, rating - .1), avatar: "/brand/salonny-mark.png", services: services.slice(0, 2).map((service) => service.id) },
    ],
  };
});

export const DEMO_BUSINESS_COUNT = DEMO_BUSINESSES.length;
