export const BRAND = {
  name: process.env.NEXT_PUBLIC_BRAND_NAME ?? "Salonny",
  legalName: process.env.NEXT_PUBLIC_BRAND_LEGAL_NAME ?? "Salonny Teknoloji A.Ş.",
  tagline: "Hizmetin yeni adresi",
  description: "Türkiye'nin hizmet ve randevu platformu",
  siteUrl: (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  colors: {
    primary: "#6C4BF4",
    dark: "#15151A",
    background: "#F7F7FA",
    secondary: "#A78BFA",
    success: "#22C55E",
  },
} as const;

export const BRAND_NAME = BRAND.name;
