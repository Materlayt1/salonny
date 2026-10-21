import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BadgeCheck, BarChart3, CalendarDays, MessageCircle, Search, ShieldCheck, UsersRound } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { Footer } from "@/components/footer";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BRAND } from "@/config/brand";

export const metadata: Metadata = {
  title: "İşletmeler için online randevu ve yönetim",
  description: `${BRAND.name} ile randevu, takvim, CRM, kampanya, stok ve raporlarını tek panelden yönet.`,
  alternates: { canonical: "/business" },
};

const features = [
  { icon: CalendarDays, title: "Akıllı randevu takvimi", text: "Tüm ekibin programını tek ekranda yönet, çakışmaları otomatik önle." },
  { icon: UsersRound, title: "Müşteri CRM'i", text: "Ziyaret, harcama, tercih ve notlarıyla müşterini daha iyi tanı." },
  { icon: MessageCircle, title: "Otomatik hatırlatmalar", text: "SMS ve WhatsApp sağlayıcılarını bağlayarak no-show oranını azalt." },
  { icon: BadgeCheck, title: "Doğrulanmış değerlendirmeler", text: "Yalnız tamamlanan randevulardan gelen yorumlarla güven oluştur." },
  { icon: Search, title: "Yeni müşteri kazanımı", text: `${BRAND.name} pazaryerinde keşfedil ve boş saatlerini doldur.` },
  { icon: BarChart3, title: "Gerçek raporlar", text: "Ciro, doluluk, tekrar ziyaret ve ekip performansını canlı veriden gör." },
];

export default function BusinessLandingPage() {
  return (
    <div className="bg-white">
      <header className="border-b border-[#ECECF1]"><div className="container-shell flex h-[72px] items-center"><BrandLogo /><nav className="ml-auto hidden items-center gap-7 text-sm md:flex"><a href="#features">Özellikler</a><a href="#start">Nasıl başlarım?</a><Link href="/auth/login?account=business">Giriş Yap</Link><ButtonLink href="/business/onboarding" className="h-10">Ücretsiz Başla</ButtonLink></nav></div></header>
      <main>
        <section className="overflow-hidden bg-[#F9F8FF] py-16 md:py-24"><div className="container-shell text-center"><Badge>Türkiye&apos;nin yeni nesil işletme platformu</Badge><h1 className="text-balance mx-auto mt-6 max-w-4xl text-5xl font-bold tracking-[-.05em] md:text-7xl">İşletmeni {BRAND.name} ile <span className="text-[#6C4BF4]">büyüt.</span></h1><p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-[#666672] md:text-lg">Randevudan müşteri yönetimine, stoktan raporlara kadar ihtiyacın olan araçlar gerçek verilerle tek panelde.</p><div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row"><ButtonLink href="/business/onboarding" className="h-12 px-7">Ücretsiz Başla <ArrowRight className="h-4 w-4" /></ButtonLink><ButtonLink href="/auth/login?account=business&next=/business/dashboard" variant="ghost" className="h-12 px-7">İşletme hesabıma gir</ButtonLink></div><p className="mt-4 text-xs text-[#8A8A94]">Kredi kartı gerekmez · Kurulumu daha sonra tamamlayabilirsin</p><div className="surface soft-shadow mx-auto mt-14 max-w-5xl overflow-hidden p-3 text-left"><div className="grid gap-4 rounded-2xl bg-[#F7F7FA] p-5 md:grid-cols-3 md:p-8">{features.slice(0, 3).map(({ icon: Icon, title, text }) => <article key={title} className="rounded-2xl bg-white p-6"><span className="grid h-11 w-11 place-items-center rounded-xl bg-[#F0ECFF] text-[#6C4BF4]"><Icon className="h-5 w-5" /></span><h2 className="mt-5 font-semibold">{title}</h2><p className="mt-2 text-sm leading-6 text-[#686872]">{text}</p></article>)}</div></div></div></section>
        <section id="features" className="container-shell py-20"><div className="mx-auto max-w-2xl text-center"><Badge>Her şey bir arada</Badge><h2 className="mt-5 text-4xl font-bold tracking-[-.04em]">İşletmeni yönetmenin sade yolu</h2><p className="mt-4 text-[#686872]">Yoğun iş gününde teknolojiyle uğraşma; müşterilerine odaklan.</p></div><div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">{features.map(({ icon: Icon, title, text }) => <article key={title} className="rounded-[22px] border border-[#E8E8EE] p-6"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#F0ECFF] text-[#6C4BF4]"><Icon className="h-5 w-5" /></span><h3 className="mt-5 text-lg font-semibold">{title}</h3><p className="mt-2 text-sm leading-6 text-[#686872]">{text}</p></article>)}</div></section>
        <section id="start" className="container-shell py-20"><div className="rounded-[28px] bg-[#6C4BF4] px-6 py-12 text-center text-white md:px-12"><ShieldCheck className="mx-auto h-10 w-10" /><h2 className="mt-5 text-3xl font-bold">İşletmeni bugün dijitale taşı.</h2><p className="mx-auto mt-3 max-w-xl text-sm text-white/70">Ücretsiz profilini oluştur, hizmetlerini ve ekibini ekle, incelemeye gönder ve randevu almaya başla.</p><ButtonLink href="/business/onboarding" className="mt-7 bg-white text-[#5B3BE7] shadow-none hover:bg-[#F1EDFF]">Hemen Başla <ArrowRight className="h-4 w-4" /></ButtonLink></div></section>
      </main>
      <Footer />
    </div>
  );
}
