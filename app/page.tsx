import Image from "next/image";
import Link from "next/link";
import { ArrowRight, LocateFixed, Search } from "lucide-react";
import { BusinessCard } from "@/components/business-card";
import { CategoryGrid } from "@/components/category-grid";
import { Footer } from "@/components/footer";
import { MobileNav } from "@/components/mobile-nav";
import { MobileHomeHeader } from "@/components/mobile-home-header";
import { SectionHeading } from "@/components/section-heading";
import { SiteHeader } from "@/components/site-header";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { BRAND } from "@/config/brand";
import { listMarketplaceBusinesses } from "@/lib/marketplace";
import { listPublicCategories } from "@/lib/categories";

export default async function HomePage() {
  const [businesses, categories] = await Promise.all([listMarketplaceBusinesses(12), listPublicCategories()]);
  const additionalBusinesses = businesses.length > 4 ? businesses.slice(4) : businesses;
  return (
    <>
      <div className="min-h-screen bg-white md:hidden">
        <MobileHomeHeader />
        <main className="px-5 pb-7">
          <h1 className="text-[22px] font-bold leading-tight tracking-[-.025em]">Bugün neye ihtiyacın var?</h1>
          <form action="/kesfet" className="mt-4 flex h-12 items-center gap-2.5 rounded-xl border border-[#E5E5EB] bg-white px-3.5 shadow-[0_3px_12px_rgba(30,25,55,.05)]">
            <Search className="h-4.5 w-4.5 shrink-0 text-[#777781]" />
            <input name="q" className="min-w-0 flex-1 bg-transparent text-[12px] outline-none placeholder:text-[#9999A3]" placeholder="Hizmet, işletme veya kategori ara..." />
          </form>

          <section id="categories" className="pt-5">
            <CategoryGrid categories={categories} />
          </section>

          <section className="pt-8">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-[14px] font-bold">Yakınındaki popüler işletmeler</h2>
              <Link href="/kesfet" className="shrink-0 text-[11px] font-semibold text-[#6C4BF4]">Tümünü gör</Link>
            </div>
            {businesses.length ? (
              <div className="grid gap-2.5">
                {businesses.slice(0, 5).map((business) => <BusinessCard key={business.id} business={business} horizontal mobileCompact />)}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-[#D9D4F3] bg-[#FBFAFF] px-5 py-7 text-center">
                <h3 className="text-sm font-semibold">Yakında burada</h3>
                <p className="mt-1 text-xs leading-5 text-[#777781]">Yayınlanan işletmeler konumuna göre otomatik sıralanacak.</p>
                <ButtonLink href="/kesfet" className="mt-4 h-9 px-4 text-xs">Keşfet</ButtonLink>
              </div>
            )}
          </section>
        </main>
      </div>

      <div className="hidden md:block">
      <SiteHeader />
      <main>
        <section className="overflow-hidden bg-white pb-9 pt-8 lg:pb-10 lg:pt-10">
          <svg aria-hidden="true" className="absolute h-0 w-0"><defs><clipPath id="salonny-hero-shape" clipPathUnits="objectBoundingBox"><path d="M .27 0 H 1 V 1 H .28 C .08 1 -.04 .82 .15 .62 C .29 .47 .04 .40 .06 .21 C .08 .08 .15 0 .27 0 Z" /></clipPath></defs></svg>
          <div className="container-shell grid min-h-[430px] items-center gap-10 lg:grid-cols-[.96fr_1.04fr]">
            <div className="max-w-[570px] py-6">
              <h1 className="text-balance text-[48px] font-bold leading-[1.02] tracking-[-.048em] xl:text-[58px]">Hizmetin<br /><span className="text-[#6C4BF4]">Yeni Adresi</span></h1>
              <p className="mt-5 max-w-[430px] text-[15px] leading-6 text-[#555560]">Kuaför, berber, güzellik, veteriner ve daha fazlası için randevunu kolayca al.</p>
              <form action="/kesfet" className="mt-7 flex h-14 max-w-[610px] items-center rounded-xl border border-[#DFDFE7] bg-white p-1.5 shadow-[0_9px_30px_rgba(44,35,83,.08)]">
                <label className="flex min-w-0 flex-1 items-center gap-3 px-3 text-sm text-[#777781]"><Search className="h-5 w-5 shrink-0 text-[#777781]" /><input name="q" className="min-w-0 flex-1 bg-transparent text-[#27272A] outline-none placeholder:text-[#9A9AA3]" placeholder="Hizmet, işletme veya kategori ara..." /></label>
                <button className="h-11 rounded-lg bg-[#6C4BF4] px-7 text-sm font-semibold text-white transition hover:bg-[#5635E6]">Ara</button>
              </form>
            </div>
            <div className="relative hidden min-h-[430px] lg:block">
              <div className="absolute inset-0 overflow-hidden bg-[#EEE9FF]" style={{ clipPath: "url(#salonny-hero-shape)" }}>
                <Image src="https://images.unsplash.com/photo-1562322140-8baeececf3df?w=1200&auto=format&fit=crop" alt="Modern kuaför salonunda saç bakımı" fill priority className="object-cover object-center" sizes="620px" />
              </div>
              <div className="surface soft-shadow absolute bottom-14 left-[20%] w-[220px] p-4">
                <strong className="block text-sm">Yakınındaki<br />işletmeleri keşfet</strong>
                <p className="mt-2 text-xs leading-5 text-[#777781]">Konumunu aç, çevrendeki popüler işletmeleri gör.</p>
                <Link href="/kesfet" className="mt-3 flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[#6C4BF4] text-xs font-semibold text-white"><LocateFixed className="h-3.5 w-3.5" /> Konumumu Aç</Link>
              </div>
            </div>
          </div>
          <div id="categories" className="container-shell mt-5"><CategoryGrid categories={categories} /></div>
        </section>

        <section className="container-shell py-8 md:py-12">
          <SectionHeading title="Yakınındaki popüler işletmeler" description="Yayındaki ve kullanıcıların sevdiği işletmeler" href="/kesfet" />
          {businesses.length ? <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">{businesses.slice(0, 4).map((business) => <BusinessCard key={business.id} business={business} />)}</div> : <div className="surface p-10 text-center"><h3 className="font-semibold">Henüz yayınlanmış işletme yok</h3><p className="mt-2 text-sm text-[#777781]">Onaylanan işletmeler burada otomatik görünecek.</p><ButtonLink href="/business" className="mt-5">İlk işletmeyi ekle</ButtonLink></div>}
        </section>

        <section className="container-shell py-10 md:py-16">
          <div className="overflow-hidden rounded-[28px] bg-[#6C4BF4] px-6 py-9 text-white shadow-[0_18px_50px_rgba(77,45,196,.22)] md:px-12 md:py-12">
            <div className="grid items-center gap-8 md:grid-cols-[1fr_auto]">
              <div><Badge className="border border-white/20 bg-white/15 text-white">İşletmeler için {BRAND.name}</Badge><h2 className="mt-4 max-w-2xl text-3xl font-bold tracking-[-.035em] text-white md:text-4xl">Takvimini düzenle, müşteri kazan, işletmeni büyüt.</h2><p className="mt-3 max-w-xl text-sm leading-6 text-white/80">Randevu, CRM, raporlar, ekip ve kampanyalar tek platformda. Başlamak ücretsiz.</p></div>
              <ButtonLink href="/business" variant="inverted" className="w-full md:w-auto">İşletmeni ücretsiz ekle <ArrowRight className="h-4 w-4" /></ButtonLink>
            </div>
          </div>
        </section>

        <section className="container-shell py-8 md:py-12" data-testid="more-businesses">
          <SectionHeading title="Keşfedilecek daha çok yer" href="/kesfet" />
          {additionalBusinesses.length ? <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{additionalBusinesses.map((business) => <BusinessCard key={business.id} business={business} horizontal />)}</div> : <p className="rounded-2xl border border-dashed border-[#D9D4F3] p-8 text-center text-sm text-[#777781]">Henüz yayınlanmış işletme yok. Onaylanan işletmeler burada otomatik görünecek.</p>}
        </section>
      </main>
      <Footer />
      </div>
      <MobileNav />
    </>
  );
}
