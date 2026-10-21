declare module "*.png" {
  const image: number;
  export default image;
}

// Metro loads this stylesheet for the web map. A fresh checkout must not rely
// on ignored Expo-generated ambient CSS typings to accept the side effect.
declare module "maplibre-gl/dist/maplibre-gl.css" {}
