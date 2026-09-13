import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { BRAND } from "@/config/brand";

export function Footer() {
  return (
    <footer className="mt-20 border-t border-[#E8E8EE] bg-white py-12 md:py-16">
      <div className="container-shell grid gap-10 md:grid-cols-[1.2fr_.8fr_.8fr_.8fr]">
        <div><BrandLogo /><p className="mt-4 max-w-xs text-sm leading-6 text-[#686872]">{BRAND.description}. Yakınındaki iyi hizmeti bul, güvenle randevu al.</p></div>
        <div><h3 className="text-sm font-semibold">{BRAND.name}</h3><div className="mt-4 grid gap-3 text-sm text-[#686872]"><Link href="/kesfet">Keşfet</Link><Link href="/business">İşletmeler için</Link><Link href="/business#start">Ücretsiz başla</Link></div></div>
        <div><h3 className="text-sm font-semibold">Destek</h3><div className="mt-4 grid gap-3 text-sm text-[#686872]"><Link href="/profile/help">Yardım ve iletişim</Link><Link href="/delete-account">Hesap silme</Link></div></div>
        <div><h3 className="text-sm font-semibold">Yasal</h3><div className="mt-4 grid gap-3 text-sm text-[#686872]"><Link href="/privacy">Gizlilik</Link><Link href="/kvkk">KVKK</Link><Link href="/terms">Kullanım şartları</Link><Link href="/cookies">Çerezler</Link></div></div>
      </div>
      <div className="container-shell mt-10 border-t border-[#ECECF1] pt-6 text-xs text-[#6F6F78]">© {new Date().getFullYear()} {BRAND.legalName}. Tüm hakları saklıdır.</div>
    </footer>
  );
}
