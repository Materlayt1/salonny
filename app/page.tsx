import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BadgeCheck, CalendarCheck2, CircleDollarSign, Clock3, LocateFixed, MapPinned, Search, ShieldCheck, Sparkles, Star, Store, Zap } from "lucide-react";
import { BusinessCard } from "@/components/business-card";
import { CategoryGrid } from "@/components/category-grid";
import { Footer } from "@/components/footer";
import { HomeMapPreview } from "@/components/home-map-preview";
import { MobileHomeHeader } from "@/components/mobile-home-header";
import { MobileNav } from "@/components/mobile-nav";
import { SectionHeading } from "@/components/section-heading";
import { SiteHeader } from "@/components/site-header";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { BRAND } from "@/config/brand";
import { listPublicCategories } from "@/lib/categories";
import { listMarketplaceBusinesses } from "@/lib/marketplace";
import type { Business } from "@/lib/types";

type PopularItem = { name: string; href: string; detail: string; price?: number };

function popularItems(businesses: Business[], categories: Awaited<ReturnType<typeof listPublicCategories>>): PopularItem[] {
  const services = new Map<string, { name: string; businesses: Set<string>; minimumPrice: number }>();
  for (const business of businesses) {
    for (const service of business.services) {
      const key = service.name.trim().toLocaleLowerCase("tr-TR");
      const current = services.get(key) ?? { name: service.name, businesses: new Set<string>(), minimumPrice: service.price };
      current.businesses.add(business.id);
      current.minimumPrice = Math.min(current.minimumPrice, service.price);
      services.set(key, current);
    }
  }
  const items = [...services.values()]
    .sort((a, b) => b.businesses.size - a.businesses.size || a.minimumPrice - b.minimumPrice)
    .slice(0, 6)
    .map((item) => ({ name: item.name, href: `/kesfet?q=${encodeURIComponent(item.name)}`, detail: `${item.businesses.size} işletmede`, price: item.minimumPrice }));
  if (items.length) return items;
  return categories.slice(0, 6).map((category) => ({ name: category.name, href: `/kesfet?category=${category.id}`, detail: "Kategoriyi keşfet" }));
}

function BusinessRail({ businesses }: { businesses: Business[] }) {
  return <div className="flex gap-3 overflow-x-auto pb-2 hide-scrollbar lg:grid lg:grid-cols-3 xl:grid-cols-4">{businesses.map((business) => <div key={business.id} className="w-[86vw] max-w-[380px] shrink-0 lg:w-auto lg:max-w-none"><BusinessCard business={business} horizontal mobileCompact /></div>)}</div>;
}

export default async function HomePage() {
  const [businesses, categories] = await Promise.all([listMarketplaceBusinesses(50), listPublicCategories()]);
  const featured = businesses.slice(0, 8);
  const newest = [...businesses].sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "")).slice(0, 8);
  const rated = [...businesses].filter((business) => business.reviews > 0).sort((a, b) => b.rating - a.rating || b.reviews - a.reviews).slice(0, 8);
  const topics = popularItems(businesses, categories);
  const cityCount = new Set(businesses.map((business) => business.city).filter(Boolean)).size;
  const openCount = businesses.filter((business) => business.open).length;
  const reviews = businesses.flatMap((business) => (business.reviewItems ?? []).map((review) => ({ ...review, businessName: business.name }))).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 3);
  const topicStyles = ["bg-[#F0ECFF] text-[#5B3BE7]", "bg-[#FFE8F1] text-[#D63B7C]", "bg-[#E5F7F1] text-[#14866D]", "bg-[#FFF0E5] text-[#C56820]", "bg-[#E9EEFF] text-[#4565C9]", "bg-[#F2E9FF] text-[#8347CC]"];

  return (
    <>
      <div className="bg-white md:hidden"><MobileHomeHeader /></div>
      <div className="hidden md:block"><SiteHeader /></div>

      <main className="overflow-hidden bg-white">
        <section className="relative border-b border-[#EEEAF8] bg-[linear-gradient(180deg,#FFFFFF_0%,#FBFAFF_100%)] pb-8 pt-3 md:pb-12 md:pt-10">
          <svg aria-hidden="true" className="absolute h-0 w-0"><defs><clipPath id="salonny-hero-shape" clipPathUnits="objectBoundingBox"><path d="M .27 0 H 1 V 1 H .28 C .08 1 -.04 .82 .15 .62 C .29 .47 .04 .40 .06 .21 C .08 .08 .15 0 .27 0 Z" /></clipPath></defs></svg>
          <div className="container-shell grid items-center gap-8 lg:min-h-[430px] lg:grid-cols-[.96fr_1.04fr]">
            <div className="max-w-[610px]">
              <Badge className="hidden bg-[#F0ECFF] text-[#5B3BE7] md:inline-flex"><Sparkles className="mr-1 h-3.5 w-3.5" /> Yakınındaki iyi hizmet burada</Badge>
              <h1 className="text-[26px] font-bold leading-[1.08] tracking-[-.035em] md:mt-5 md:text-[48px] md:leading-[1.02] xl:text-[58px]"><span className="md:hidden">Bugün neye ihtiyacın var?</span><span className="hidden md:inline">Hizmetin<br /><span className="text-[#6C4BF4]">Yeni Adresi</span></span></h1>
              <p className="mt-3 max-w-[470px] text-[13px] leading-6 text-[#666672] md:mt-5 md:text-[15px]">Kuaför, berber, güzellik, veteriner ve daha fazlasını keşfet; sana uygun randevuyu kolayca oluştur.</p>
              <form action="/kesfet" className="mt-5 flex h-13 items-center rounded-xl border border-[#DFDFE7] bg-white p-1.5 shadow-[0_9px_30px_rgba(44,35,83,.08)] md:mt-7 md:h-14">
                <label className="flex min-w-0 flex-1 items-center gap-2.5 px-2.5 text-sm text-[#777781] md:gap-3 md:px-3"><Search className="h-4.5 w-4.5 shrink-0 md:h-5 md:w-5" /><input name="q" className="min-w-0 flex-1 bg-transparent text-xs text-[#27272A] outline-none placeholder:text-[#9A9AA3] md:text-sm" placeholder="Hizmet, işletme veya kategori ara..." /></label>
                <button className="h-10 rounded-lg bg-[#6C4BF4] px-5 text-xs font-semibold text-white transition hover:bg-[#5635E6] md:h-11 md:px-7 md:text-sm">Ara</button>
              </form>
              <div className="mt-3.5 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                <Link href="/kesfet?nearby=1" className="flex h-10 items-center justify-center gap-1.5 rounded-xl border border-[#E5E1F2] bg-white px-3 text-[11px] font-semibold text-[#4D3C91]"><LocateFixed className="h-3.5 w-3.5 text-[#6C4BF4]" /> Yakınımdakiler</Link>
                <Link href="/kesfet?open=1" className="flex h-10 items-center justify-center gap-1.5 rounded-xl border border-[#E5E1F2] bg-white px-3 text-[11px] font-semibold text-[#4D3C91]"><Clock3 className="h-3.5 w-3.5 text-[#6C4BF4]" /> Şu an açık</Link>
                <Link href="/kesfet?sort=rating" className="flex h-10 items-center justify-center gap-1.5 rounded-xl border border-[#E5E1F2] bg-white px-3 text-[11px] font-semibold text-[#4D3C91]"><Star className="h-3.5 w-3.5 text-[#6C4BF4]" /> En yüksek puan</Link>
                <Link href="/kesfet?sort=price" className="flex h-10 items-center justify-center gap-1.5 rounded-xl border border-[#E5E1F2] bg-white px-3 text-[11px] font-semibold text-[#4D3C91]"><CircleDollarSign className="h-3.5 w-3.5 text-[#6C4BF4]" /> Uygun fiyat</Link>
              </div>
            </div>

            <div className="relative hidden min-h-[430px] lg:block">
              <div className="absolute inset-0 overflow-hidden bg-[#EEE9FF]" style={{ clipPath: "url(#salonny-hero-shape)" }}><Image src="https://images.unsplash.com/photo-1562322140-8baeececf3df?w=1200&auto=format&fit=crop" alt="Modern kuaför salonunda saç bakımı" fill priority className="object-cover object-center" sizes="620px" /></div>
              <div className="surface soft-shadow absolute bottom-14 left-[20%] w-[230px] p-4"><strong className="block text-sm">Yakınındaki işletmeleri keşfet</strong><p className="mt-2 text-xs leading-5 text-[#777781]">Konumunu aç, çevrendeki yayınlanmış işletmeleri haritada gör.</p><Link href="/kesfet?nearby=1" className="mt-3 flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[#6C4BF4] text-xs font-semibold text-white"><LocateFixed className="h-3.5 w-3.5" /> Konumumu Aç</Link></div>
            </div>
          </div>
        </section>

        <section className="container-shell py-8 md:py-12"><SectionHeading title="Kategoriler" description="İhtiyacına uygun alanı seç" href="/kesfet" /><CategoryGrid categories={categories} /></section>

        <section className="border-y border-[#EEEAF6] bg-[#FAF9FD] py-8 md:py-12"><div className="container-shell"><SectionHeading title="Yakınındaki popüler işletmeler" description="Yayındaki işletmeler ve uygun randevu seçenekleri" href="/kesfet" />{featured.length ? <BusinessRail businesses={featured} /> : <div className="rounded-[22px] border border-dashed border-[#D9D4F3] bg-white p-8 text-center"><Store className="mx-auto h-8 w-8 text-[#8D75F5]" /><h3 className="mt-3 font-semibold">Yeni işletmeler hazırlanıyor</h3><p className="mt-2 text-sm text-[#777781]">Onaylanan profiller burada otomatik olarak yerini alacak.</p></div>}</div></section>

        {businesses.length > 0 && <section className="container-shell py-10 md:py-16"><div className="grid items-center gap-7 lg:grid-cols-[.68fr_1.32fr] lg:gap-12"><div><Badge><MapPinned className="mr-1 h-3.5 w-3.5" /> Canlı keşif haritası</Badge><h2 className="mt-4 text-3xl font-bold tracking-[-.04em] md:text-4xl">Çevrendeki seçenekleri tek bakışta gör.</h2><p className="mt-4 text-sm leading-7 text-[#666672]">Yayındaki işletmeler mor pinlerle haritada. Bir pine dokun, işletmeyi seç ve ayrıntılara geç.</p><div className="mt-6 grid grid-cols-3 gap-2"><div className="rounded-2xl bg-[#F5F2FF] p-3"><strong className="block text-xl text-[#5B3BE7]">{businesses.length}</strong><span className="mt-1 block text-[10px] text-[#777781]">İşletme</span></div><div className="rounded-2xl bg-[#F5F2FF] p-3"><strong className="block text-xl text-[#5B3BE7]">{categories.length}</strong><span className="mt-1 block text-[10px] text-[#777781]">Kategori</span></div><div className="rounded-2xl bg-[#F5F2FF] p-3"><strong className="block text-xl text-[#5B3BE7]">{cityCount}</strong><span className="mt-1 block text-[10px] text-[#777781]">Şehir</span></div></div></div><HomeMapPreview businesses={businesses} /></div></section>}

        <section className="bg-[#17151F] py-10 text-white md:py-16"><div className="container-shell"><div className="[&_a]:!text-[#D8CCFF] [&_p]:!text-white/65"><SectionHeading title="Popüler hizmet ve kategoriler" description="Aradığın hizmete doğrudan ulaş" href="/kesfet" /></div><div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">{topics.map((item, index) => <Link key={`${item.name}-${index}`} href={item.href} className="group rounded-[20px] bg-white p-3.5 text-[#17151F] transition hover:-translate-y-1 md:p-4"><span className={`grid h-10 w-10 place-items-center rounded-xl ${topicStyles[index % topicStyles.length]}`}><Sparkles className="h-4.5 w-4.5" /></span><strong className="mt-4 block truncate text-sm">{item.name}</strong><span className="mt-1 block text-[10px] text-[#777781]">{item.detail}</span>{item.price !== undefined && <span className="mt-3 block text-xs font-semibold text-[#5B3BE7]">{item.price.toLocaleString("tr-TR")} TL&apos;den</span>}</Link>)}</div></div></section>

        {newest.length > 0 && <section className="container-shell py-10 md:py-16"><SectionHeading title="Yeni eklenen işletmeler" description="Salonny ailesine en son katılan yerler" href="/kesfet" /><BusinessRail businesses={newest} /></section>}

        {rated.length > 0 && <section className="border-y border-[#EEEAF6] bg-[#FAF9FD] py-10 md:py-16"><div className="container-shell"><SectionHeading title="En yüksek puanlılar" description="Doğrulanmış değerlendirmelerde öne çıkan işletmeler" href="/kesfet?sort=rating" /><BusinessRail businesses={rated} /></div></section>}

        {reviews.length > 0 && <section className="container-shell py-10 md:py-16"><SectionHeading title="Müşteriler ne diyor?" description="Tamamlanan randevulardan gelen gerçek değerlendirmeler" /><div className="grid gap-3 md:grid-cols-3">{reviews.map((review) => <article key={review.id} className="rounded-[22px] border border-[#E8E8EE] bg-white p-5"><div className="flex gap-1">{Array.from({ length: 5 }).map((_, index) => <Star key={index} className={`h-4 w-4 ${index < review.rating ? "fill-[#F5B942] text-[#F5B942]" : "text-[#D6D6DC]"}`} />)}</div><p className="mt-4 line-clamp-4 text-sm leading-6 text-[#555560]">{review.comment || "Bu işletme için puan bırakıldı."}</p><strong className="mt-5 block text-xs">{review.businessName}</strong></article>)}</div></section>}

        <section className="container-shell py-10 md:py-16"><div className="grid gap-3 md:grid-cols-3">{[{ icon: CalendarCheck2, title: "Kolay randevu", text: "Uygun hizmeti ve saati seç, randevunu birkaç adımda oluştur." }, { icon: BadgeCheck, title: "Gerçek işletmeler", text: "Yayınlanan profiller, konumlar ve hizmetler güncel verilerden gelir." }, { icon: ShieldCheck, title: "Güvenli hesap", text: "Hesabın, tercihlerin ve randevu hareketlerin güvenle yönetilir." }].map(({ icon: Icon, title, text }) => <article key={title} className="rounded-[22px] border border-[#E9E6F2] bg-white p-5"><span className="grid h-11 w-11 place-items-center rounded-xl bg-[#F0ECFF] text-[#5B3BE7]"><Icon className="h-5 w-5" /></span><h2 className="mt-4 font-semibold">{title}</h2><p className="mt-2 text-sm leading-6 text-[#777781]">{text}</p></article>)}</div></section>

        <section className="container-shell pb-8 pt-2 md:pb-16"><div className="overflow-hidden rounded-[28px] bg-[#6C4BF4] px-6 py-9 text-white shadow-[0_18px_50px_rgba(77,45,196,.22)] md:px-12 md:py-12"><div className="grid items-center gap-8 md:grid-cols-[1fr_auto]"><div><Badge className="border border-white/20 bg-white/15 text-white">İşletmeler için {BRAND.name}</Badge><h2 className="mt-4 max-w-2xl text-3xl font-bold tracking-[-.035em] text-white md:text-4xl">Takvimini düzenle, müşteri kazan, işletmeni büyüt.</h2><p className="mt-3 max-w-xl text-sm leading-6 text-white/80">Randevu, CRM, raporlar, ekip ve kampanyalar tek platformda. Başlamak ücretsiz.</p><div className="mt-5 flex flex-wrap gap-3 text-xs text-white/80"><span className="flex items-center gap-1.5"><Zap className="h-3.5 w-3.5" /> Hızlı kurulum</span><span className="flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" /> Kredi kartı gerekmez</span>{openCount > 0 && <span className="flex items-center gap-1.5"><Store className="h-3.5 w-3.5" /> {openCount} işletme şu an açık</span>}</div></div><ButtonLink href="/business" variant="inverted" className="w-full md:w-auto">İşletmeni ücretsiz ekle <ArrowRight className="h-4 w-4" /></ButtonLink></div></div></section>
      </main>

      <div className="pb-20 md:pb-0 [&_footer]:mt-0"><Footer /></div>
      <MobileNav />
    </>
  );
}
