import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, BarChart3, CalendarDays, Check, CreditCard, MessageCircle, Search, ShieldCheck, UsersRound } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { Footer } from "@/components/footer";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BRAND } from "@/config/brand";
import { createServerClientOptional } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "İşletmeler için online randevu ve yönetim",
  description: `${BRAND.name} ile randevu, takvim, CRM, kampanya, stok ve raporlarını tek panelden yönet.`,
  alternates: { canonical: "/business" },
};

const features = [
  { icon: CalendarDays, title: "Akıllı randevu takvimi", text: "Tüm ekibin programını tek ekranda yönet, çakışmaları otomatik önle." },
  { icon: UsersRound, title: "Müşteri CRM'i", text: "Ziyaret, harcama, tercih ve notlarıyla müşterini daha iyi tanı." },
  { icon: MessageCircle, title: "Otomatik hatırlatmalar", text: "SMS ve WhatsApp sağlayıcılarını bağlayarak no-show oranını azalt." },
  { icon: CreditCard, title: "Ödeme ve depozito", text: "Ödeme sağlayıcını bağla, depozito ve ödeme durumlarını güvenle takip et." },
  { icon: Search, title: "Yeni müşteri kazanımı", text: `${BRAND.name} pazaryerinde keşfedil ve boş saatlerini doldur.` },
  { icon: BarChart3, title: "Gerçek raporlar", text: "Ciro, doluluk, tekrar ziyaret ve ekip performansını canlı veriden gör." },
];

const featureLabels: Record<string, string> = {
  booking: "Online randevu", profile: "Herkese açık işletme profili", calendar: "Ekip takvimi",
  crm: "Müşteri CRM'i", reports: "Gelişmiş raporlar", whatsapp: "WhatsApp otomasyonu",
  campaigns: "Kampanyalar", multi_branch: "Çoklu şube", advanced_reports: "Gelişmiş analiz", api: "API erişimi",
};

type PlanRow = { code: string; name: string; price_minor: number | null; currency: string; interval: string | null; features: Record<string, boolean> | null };

function planPrice(plan: PlanRow) {
  if (plan.price_minor === null) return "Teklif al";
  if (plan.price_minor === 0) return "Ücretsiz";
  const value = new Intl.NumberFormat("tr-TR", { style: "currency", currency: plan.currency, maximumFractionDigits: 0 }).format(plan.price_minor / 100);
  return `${value}${plan.interval === "year" ? "/yıl" : "/ay"}`;
}

export default async function BusinessLandingPage() {
  const supabase = await createServerClientOptional();
  let plans: PlanRow[] = [];
  if (supabase) {
    const [{ data: { user } }, plansResult] = await Promise.all([
      supabase.auth.getUser(),
      supabase.from("subscription_plans").select("code,name,price_minor,currency,interval,features").eq("active", true),
    ]);
    plans = (plansResult.data ?? []) as PlanRow[];
    const order = ["FREE", "PRO", "BUSINESS"];
    plans.sort((a, b) => order.indexOf(a.code) - order.indexOf(b.code));
    if (user) {
      const { data: membership } = await supabase.from("business_members").select("business_id").eq("user_id", user.id).eq("active", true).limit(1).maybeSingle();
      if (membership?.business_id) redirect("/business/dashboard");
    }
  }

  return (
    <div className="bg-white">
      <header className="border-b border-[#ECECF1]"><div className="container-shell flex h-[72px] items-center"><BrandLogo /><nav className="ml-auto hidden items-center gap-7 text-sm md:flex"><a href="#features">Özellikler</a><a href="#pricing">Paketler</a><Link href="/auth/login?account=business">Giriş Yap</Link><ButtonLink href="/business/onboarding" className="h-10">Ücretsiz Başla</ButtonLink></nav></div></header>
      <main>
        <section className="overflow-hidden bg-[#F9F8FF] py-16 md:py-24"><div className="container-shell text-center"><Badge>Türkiye&apos;nin yeni nesil işletme platformu</Badge><h1 className="text-balance mx-auto mt-6 max-w-4xl text-5xl font-bold tracking-[-.05em] md:text-7xl">İşletmeni {BRAND.name} ile <span className="text-[#6C4BF4]">büyüt.</span></h1><p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-[#666672] md:text-lg">Randevudan müşteri yönetimine, stoktan raporlara kadar ihtiyacın olan araçlar gerçek verilerle tek panelde.</p><div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row"><ButtonLink href="/business/onboarding" className="h-12 px-7">Ücretsiz Başla <ArrowRight className="h-4 w-4" /></ButtonLink><ButtonLink href="/auth/login?account=business&next=/business/dashboard" variant="ghost" className="h-12 px-7">İşletme hesabıma gir</ButtonLink></div><p className="mt-4 text-xs text-[#8A8A94]">Kredi kartı gerekmez · Kurulumu daha sonra tamamlayabilirsin</p><div className="surface soft-shadow mx-auto mt-14 max-w-5xl overflow-hidden p-3 text-left"><div className="grid gap-4 rounded-2xl bg-[#F7F7FA] p-5 md:grid-cols-3 md:p-8">{features.slice(0, 3).map(({ icon: Icon, title, text }) => <article key={title} className="rounded-2xl bg-white p-6"><span className="grid h-11 w-11 place-items-center rounded-xl bg-[#F0ECFF] text-[#6C4BF4]"><Icon className="h-5 w-5" /></span><h2 className="mt-5 font-semibold">{title}</h2><p className="mt-2 text-sm leading-6 text-[#777781]">{text}</p></article>)}</div></div></div></section>
        <section id="features" className="container-shell py-20"><div className="mx-auto max-w-2xl text-center"><Badge>Her şey bir arada</Badge><h2 className="mt-5 text-4xl font-bold tracking-[-.04em]">İşletmeni yönetmenin sade yolu</h2><p className="mt-4 text-[#777781]">Yoğun iş gününde teknolojiyle uğraşma; müşterilerine odaklan.</p></div><div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">{features.map(({ icon: Icon, title, text }) => <article key={title} className="rounded-[22px] border border-[#E8E8EE] p-6"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#F0ECFF] text-[#6C4BF4]"><Icon className="h-5 w-5" /></span><h3 className="mt-5 text-lg font-semibold">{title}</h3><p className="mt-2 text-sm leading-6 text-[#777781]">{text}</p></article>)}</div></section>
        <section id="pricing" className="bg-[#F8F8FA] py-20"><div className="container-shell"><div className="text-center"><h2 className="text-4xl font-bold tracking-[-.04em]">İşletmenle birlikte büyüyen paketler</h2><p className="mt-3 text-[#777781]">Paketler ve ücretler veritabanındaki aktif planlardan yayınlanır.</p></div>{plans.length ? <div className="mx-auto mt-12 grid max-w-5xl gap-5 md:grid-cols-3">{plans.map((plan) => { const featured = plan.code === "PRO"; const planFeatures = Object.entries(plan.features ?? {}).filter(([, enabled]) => enabled).map(([key]) => featureLabels[key] ?? key); return <article key={plan.code} className={`rounded-[24px] border p-6 ${featured ? "border-[#6C4BF4] bg-[#17151F] text-white shadow-xl" : "border-[#E3E3EA] bg-white"}`}>{featured && <Badge className="mb-4">En popüler</Badge>}<h3 className="text-2xl font-bold">{plan.name}</h3><p className="mt-6 text-3xl font-bold">{planPrice(plan)}</p><div className="mt-6 grid gap-3">{planFeatures.map((feature) => <span key={feature} className="flex items-center gap-2 text-sm"><Check className="h-4 w-4 text-[#22C55E]" /> {feature}</span>)}</div><ButtonLink href="/business/onboarding" variant={featured ? "primary" : "ghost"} className="mt-8 w-full">Başla</ButtonLink></article>; })}</div> : <p className="mx-auto mt-10 max-w-xl rounded-2xl border border-[#E3E3EA] bg-white p-6 text-center text-sm text-[#777781]">Aktif paketler yönetim panelinden yapılandırıldığında burada yayınlanacak.</p>}</div></section>
        <section className="container-shell py-20"><div className="rounded-[28px] bg-[#6C4BF4] px-6 py-12 text-center text-white md:px-12"><ShieldCheck className="mx-auto h-10 w-10" /><h2 className="mt-5 text-3xl font-bold">İşletmeni bugün dijitale taşı.</h2><p className="mx-auto mt-3 max-w-xl text-sm text-white/70">Ücretsiz profilini oluştur, hizmetlerini ekle ve randevu almaya başla.</p><ButtonLink href="/business/onboarding" className="mt-7 bg-white text-[#5B3BE7] shadow-none hover:bg-[#F1EDFF]">Hemen Başla <ArrowRight className="h-4 w-4" /></ButtonLink></div></section>
      </main>
      <Footer />
    </div>
  );
}
