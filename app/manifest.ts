import type { MetadataRoute } from "next";
import { BRAND } from "@/config/brand";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${BRAND.name} — ${BRAND.tagline}`,
    short_name: BRAND.name,
    description: BRAND.description,
    start_url: "/",
    display: "standalone",
    background_color: "#F7F7FA",
    theme_color: "#6C4BF4",
    icons: [
      { src: "/brand/salonny-mark.png?v=2", sizes: "1254x1254", type: "image/png", purpose: "any" },
      { src: "/brand/salonny-mark.png?v=2", sizes: "1254x1254", type: "image/png", purpose: "maskable" },
    ],
  };
}
