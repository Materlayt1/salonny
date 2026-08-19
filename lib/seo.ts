export function seoSlug(value: string) {
  return value.trim().toLocaleLowerCase("tr-TR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replaceAll("ı", "i").replaceAll("ş", "s").replaceAll("ğ", "g").replaceAll("ü", "u").replaceAll("ö", "o").replaceAll("ç", "c").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function canonicalBusinessPath(business: { city: string; district: string; category: string; slug: string }) {
  return `/${seoSlug(business.city)}/${seoSlug(business.district)}/${seoSlug(business.category)}/${business.slug}`;
}
