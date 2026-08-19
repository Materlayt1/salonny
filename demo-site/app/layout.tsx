import type { Metadata, Viewport } from "next";
import "./globals.css";
import { BRAND } from "@/config/brand";

export const metadata: Metadata = {
  title: `${BRAND.name} — Görsel Demo`,
  description: "Salonny arayüzünün 35 kurgusal işletmeyle hazırlanan salt-okunur görsel demosu.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#6C4BF4" };

export default function DemoLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="tr"><body>{children}</body></html>;
}
