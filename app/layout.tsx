import type { Metadata, Viewport } from "next";
import "./globals.css";
import { BRAND } from "@/config/brand";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  title: { default: `${BRAND.name} — ${BRAND.tagline}`, template: `%s | ${BRAND.name}` },
  description: BRAND.description,
  applicationName: BRAND.name,
  category: "marketplace",
  creator: BRAND.name,
  publisher: BRAND.legalName,
  keywords: ["online randevu", "kuaför randevu", "berber randevu", "güzellik salonu", "veteriner randevu", "İzmir hizmet işletmeleri"],
  alternates: { canonical: "/" },
  openGraph: { type: "website", locale: "tr_TR", url: "/", siteName: BRAND.name, title: `${BRAND.name} — ${BRAND.tagline}`, description: BRAND.description, images: [{ url: "/brand/salonny-mark.png?v=2", alt: `${BRAND.name} logosu` }] },
  twitter: { card: "summary_large_image", title: `${BRAND.name} — ${BRAND.tagline}`, description: BRAND.description, images: ["/brand/salonny-mark.png?v=2"] },
  formatDetection: { email: false, address: false, telephone: false },
  verification: { google: process.env.GOOGLE_SITE_VERIFICATION },
  manifest: "/manifest.webmanifest",
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 } },
  icons: { icon: "/brand/salonny-mark.png?v=2", apple: "/brand/salonny-mark.png?v=2" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#6C4BF4",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const structuredData = [{ "@context": "https://schema.org", "@type": "Organization", "@id": `${BRAND.siteUrl}/#organization`, name: BRAND.name, legalName: BRAND.legalName, url: BRAND.siteUrl, logo: `${BRAND.siteUrl}/brand/salonny-mark.png` }, { "@context": "https://schema.org", "@type": "WebSite", "@id": `${BRAND.siteUrl}/#website`, url: BRAND.siteUrl, name: BRAND.name, publisher: { "@id": `${BRAND.siteUrl}/#organization` }, inLanguage: "tr-TR", potentialAction: { "@type": "SearchAction", target: { "@type": "EntryPoint", urlTemplate: `${BRAND.siteUrl}/kesfet?q={search_term_string}` }, "query-input": "required name=search_term_string" } }];
  return (
    <html lang="tr">
      <body>{children}<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} /></body>
    </html>
  );
}
