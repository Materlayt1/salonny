import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { CategoryGrid } from "@/components/category-grid";
import { listPublicCategories } from "@/lib/categories";
import { MobileNav } from "@/components/mobile-nav";

export const metadata: Metadata = { title: "Hizmet kategorileri", description: "İhtiyacın olan kategoriyi seç; seçtiğin şehirdeki işletmeleri keşfet.", alternates: { canonical: "/kategoriler" } };
export const revalidate = 300;
export default async function CategoriesPage() {
  const categories = await listPublicCategories();
  return <><SiteHeader /><main id="main-content" className="container-shell py-10 pb-28 md:py-16"><p className="text-sm font-medium text-[#6C4BF4]">Sana uygun hizmeti bul</p><h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#27272A]">Kategoriler</h1><p className="mb-8 mt-3 max-w-xl text-sm leading-6 text-[#686872]">Bir kategori seç, seçtiğin şehirdeki işletmeleri keşfet. Şehir ve yakınlık tercihin korunur.</p>{categories.length ? <CategoryGrid categories={categories} directory /> : <p role="status" className="rounded-2xl border bg-white p-6">Şu anda yayında kategori bulunmuyor.</p>}</main><MobileNav /></>;
}
