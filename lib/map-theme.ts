import type { StyleSpecification } from "maplibre-gl";

const MAP_TILE_URL = process.env.NEXT_PUBLIC_MAP_TILE_URL?.trim()
  || "https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png";

export const MAP_PRIMARY = "#6C4BF4";
export const MAP_PRIMARY_DARK = "#5130D7";
export const MAP_WHITE = "#FFFFFF";

export function createSalonnyMapStyle(): StyleSpecification {
  return {
    version: 8,
    sources: {
      salonny: {
        type: "raster",
        tiles: [MAP_TILE_URL],
        tileSize: 256,
        attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> · © <a href="https://carto.com/attributions" target="_blank">CARTO</a>',
      },
    },
    layers: [{
      id: "salonny-basemap",
      type: "raster",
      source: "salonny",
      paint: {
        "raster-saturation": -.14,
        "raster-contrast": -.06,
        "raster-brightness-min": .06,
        "raster-brightness-max": .98,
        "raster-fade-duration": 180,
      },
    }],
  };
}
