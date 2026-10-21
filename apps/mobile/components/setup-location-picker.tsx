import { Map, Camera, GeoJSONSource, Layer, TransformRequestManager } from "@maplibre/maplibre-react-native";
import { Text, View } from "react-native";
import { useState } from "react";
import { businessMapStyle } from "@/lib/map";
export type LocationPoint = { latitude: number; longitude: number };
TransformRequestManager.addHeader({ id: "salonny-osm-user-agent", match: /^https:\/\/tile\.openstreetmap\.org\//, name: "User-Agent", value: "Salonny/0.1.0 (com.salonny.app)" });
export function SetupLocationPicker({ point, onChange }: { point: LocationPoint | null; onChange: (point: LocationPoint) => void }) {
  const [failed, setFailed] = useState(false);
  return <View style={{ height: 260, borderRadius: 14, overflow: "hidden" }}>
    <Map testID="setup-location-map" mapStyle={businessMapStyle} attribution logo={false} touchRotate={false} onDidFailLoadingMap={() => setFailed(true)} onPress={(event) => { const [longitude, latitude] = event.nativeEvent.lngLat; onChange({ latitude: Number(latitude.toFixed(6)), longitude: Number(longitude.toFixed(6)) }); }}>
      <Camera initialViewState={{ center: point ? [point.longitude, point.latitude] : [35.24, 38.96], zoom: point ? 13 : 5 }} />
      {point ? <GeoJSONSource id="setup-location" data={{ type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [point.longitude, point.latitude] } }] }}><Layer id="setup-location-pin" type="circle" paint={{ "circle-color": "#6C4BF4", "circle-radius": 10, "circle-stroke-width": 3, "circle-stroke-color": "#fff" }} /></GeoJSONSource> : null}
    </Map>
    {failed ? <Text style={{ backgroundColor: "white", position: "absolute", bottom: 30, padding: 8 }}>Harita yüklenemedi. Koordinat alanlarını kullanabilirsin.</Text> : null}
  </View>;
}
