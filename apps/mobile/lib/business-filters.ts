/** Pure filter model can also be validated outside the native runtime. */
export type BusinessFilters = { category: string; city: string; sort: "recommended" | "rating" | "newest" | "name" | "price" | "nearest"; open: boolean };
export const defaultBusinessFilters: BusinessFilters = { category: "", city: "", sort: "recommended", open: false };
export const sortLabels: Record<BusinessFilters["sort"], string> = { recommended: "Önerilen", rating: "En yüksek puan", newest: "En yeniler", name: "A-Z", price: "Uygun fiyat", nearest: "En yakın" };
export function filterCount(filters: BusinessFilters) {
  return Number(Boolean(filters.category)) + Number(Boolean(filters.city.trim())) + Number(filters.sort !== "recommended") + Number(filters.open);
}
export function filterSummary(filters: BusinessFilters, categories: { id: string; name: string }[]) {
  return [filters.category ? categories.find((item) => item.id === filters.category)?.name ?? "Seçili kategori" : "", filters.city.trim(), filters.sort !== "recommended" ? sortLabels[filters.sort] : "", filters.open ? "Şu an açık" : ""].filter(Boolean).join(" · ");
}
