import Link from "next/link";
import { Heart, MapPin, Star } from "lucide-react";
import { redirect } from "next/navigation";
import { FavoriteRemoveButton } from "@/components/favorite-remove-button";
import { MobileNav } from "@/components/mobile-nav";
import { SiteHeader } from "@/components/site-header";
import { createServerClientOptional, requireUser } from "@/lib/supabase/server";

type FavoriteBusiness = {
  id: string;
  name: string;
  slug: string;
  rating_average: number | string;
  review_count: number;
  business_categories: { name_tr: string } | { name_tr: string }[] | null;
  business_locations: { district: string; city: string }[] | null;
};

type FavoriteRow = { business_id: string; businesses: FavoriteBusiness | FavoriteBusiness[] | null };

function first<T>(value: T | T[] | null | undefined) { return Array.isArray(value) ? value[0] : value; }

export default async function FavoritesPage() {
  const user = await requireUser();
  if (!user) redirect("/auth/login?next=/favorites");
  const supabase = await createServerClientOptional();
  const { data } = supabase
    ? await supabase.from("favorites").select("business_id,businesses(id,name,slug,rating_average,review_count,business_categories(name_tr),business_locations(district,city))").eq("user_id", user.id).order("created_at", { ascending: false })
    : { data: [] };
  const favorites = (data ?? []) as unknown as FavoriteRow[];

  return <><SiteHeader search /><main className="container-shell min-h-[72vh] py-8 pb-28 md:py-12"><div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-[#F0ECFF]"><Heart className="h-5 w-5 fill-[#6C4BF4] text-[#6C4BF4]" /></span><div><h1 className="text-3xl font-bold tracking-[-.035em]">Favori işletmelerim</h1><p className="mt-1 text-sm text-[#777781]">{favorites.length ? `${favorites.length} kayıtlı işletme` : "Beğendiğin yerler burada görünecek."}</p></div></div>{favorites.length === 0 ? <div className="surface mt-8 px-6 py-14 text-center"><Heart className="mx-auto h-8 w-8 text-[#C4B8FA]" /><h2 className="mt-4 text-lg font-semibold">Henüz favorin yok</h2><p className="mt-2 text-sm text-[#777781]">Keşfet sayfasından sevdiğin işletmeleri kaydedebilirsin.</p><Link href="/kesfet" className="mt-5 inline-flex h-11 items-center rounded-xl bg-[#6C4BF4] px-5 text-sm font-semibold text-white">İşletmeleri keşfet</Link></div> : <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{favorites.map((favorite) => { const business = first(favorite.businesses); if (!business) return null; const category = first(business.business_categories)?.name_tr ?? "Hizmet işletmesi"; const location = first(business.business_locations); return <article key={favorite.business_id} className="surface p-5"><div className="flex items-start gap-4"><Link href={`/business/${business.slug}`} className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-[#6C4BF4] text-xl font-bold text-white">{business.name.slice(0, 1).toLocaleUpperCase("tr-TR")}</Link><div className="min-w-0 flex-1"><Link href={`/business/${business.slug}`} className="truncate font-semibold hover:text-[#6C4BF4]">{business.name}</Link><p className="mt-1 text-xs text-[#777781]">{category}</p><div className="mt-2 flex items-center gap-3 text-xs text-[#555560]"><span className="flex items-center gap-1"><Star className="h-3.5 w-3.5 fill-[#F5B942] text-[#F5B942]" /> {Number(business.rating_average).toFixed(1)} ({business.review_count})</span>{location && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {location.district}</span>}</div></div><FavoriteRemoveButton businessId={favorite.business_id} /></div></article>; })}</div>}</main><MobileNav /></>;
}
