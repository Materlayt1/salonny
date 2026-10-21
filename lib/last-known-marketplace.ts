import "server-only";
import type { Category } from "@/lib/types";

// Category labels/icons are a navigation fallback, never business records.
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


export function lastKnownMarketplaceCategories() {
  return process.env.ENABLE_LAST_KNOWN_MARKETPLACE !== "false" ? categories : [];
}
