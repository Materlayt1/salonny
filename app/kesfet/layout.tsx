import type { Metadata } from "next";
import { BRAND } from "@/config/brand";

export const metadata: Metadata = {
  title: "Yakındaki kuaför, berber ve hizmet işletmelerini keşfet",
  description: `Konumuna, kategoriye, fiyata ve doğrulanmış puanlara göre işletmeleri ${BRAND.name} üzerinde karşılaştır; uygun saati seçip online randevu al.`,
  alternates: { canonical: "/kesfet" },
  openGraph: { title: `İşletmeleri keşfet | ${BRAND.name}`, description: "Yakınındaki hizmet işletmelerini haritada gör ve randevu al.", url: "/kesfet" },
};

export default function DiscoverLayout({ children }: { children: React.ReactNode }) { return children; }
