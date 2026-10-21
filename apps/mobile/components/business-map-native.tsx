import { useEffect, useMemo, useRef, useState } from "react";
import { Map as NativeMap, Camera, GeoJSONSource, Layer, TransformRequestManager, type CameraRef, type GeoJSONSourceRef } from "@maplibre/maplibre-react-native";
import { Text, View } from "react-native";
import { businessBounds, businessFeatures, businessMapStyle, validBusinesses, type BusinessMapProps } from "@/lib/map";
import { theme } from "@/constants/theme";
// Identify the app only to the public tile host, never attach auth credentials.
TransformRequestManager.addHeader({ id: "salonny-osm-user-agent", match: /^https:\/\/tile\.openstreetmap\.org\//, name: "User-Agent", value: "Salonny/0.1.0 (com.salonny.app)" });
export default function BusinessMapNative({ items, selectedId, onSelect, height = 300 }: BusinessMapProps) {
  const camera = useRef<CameraRef>(null); const source = useRef<GeoJSONSourceRef>(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const features = useMemo(() => businessFeatures(items), [items]);
  useEffect(() => {
    if (!ready) return;
    const valid = validBusinesses(items); const bounds = businessBounds(items);
    if (valid.length === 1) camera.current?.jumpTo({ center: [valid[0].lng, valid[0].lat], zoom: 13 });
    else if (bounds) camera.current?.fitBounds([bounds[0][0], bounds[0][1], bounds[1][0], bounds[1][1]], { padding: { top: 48, bottom: 48, left: 48, right: 48 }, duration: 0 });
  }, [items, ready]);
  return <View style={{ height, borderRadius: 18, overflow: "hidden", backgroundColor: "#F0ECFF" }}>
    <NativeMap mapStyle={businessMapStyle} attribution logo={false} touchRotate={false} androidView="texture" onDidFinishLoadingStyle={() => setReady(true)} onDidFailLoadingMap={() => setFailed(true)} testID="business-map">
      <Camera ref={camera} initialViewState={{ center: [35.24, 38.96], zoom: 5.2 }} />
      <GeoJSONSource id="businesses" ref={source} data={features} cluster clusterRadius={44} clusterMaxZoom={13} onPress={(event) => {
        event.stopPropagation(); const feature = event.nativeEvent.features[0]; if (!feature) return;
        const cluster = feature.properties?.cluster_id;
        if (typeof cluster === "number" && feature.geometry.type === "Point") {
          const [longitude, latitude] = feature.geometry.coordinates;
          void source.current?.getClusterExpansionZoom(cluster).then((zoom) => camera.current?.easeTo({ center: [longitude, latitude], zoom, duration: 300 })).catch(() => setFailed(true));
        } else { const id = feature.properties?.id; const business = items.find((item) => item.id === id); if (business) onSelect(business); }
      }}>
        <Layer id="business-clusters" type="circle" filter={["has", "point_count"]} paint={{ "circle-color": theme.colors.primary, "circle-radius": 18, "circle-stroke-color": "#fff", "circle-stroke-width": 3 }} />
        <Layer id="business-pins" type="circle" filter={["!", ["has", "point_count"]]} paint={{ "circle-color": theme.colors.primary, "circle-radius": ["case", ["==", ["get", "id"], selectedId ?? ""], 13, 9], "circle-stroke-color": "#fff", "circle-stroke-width": 3 }} />
      </GeoJSONSource>
    </NativeMap>
    {failed ? <View pointerEvents="none" style={{ position: "absolute", bottom: 30, left: 12, right: 12, backgroundColor: "#fff", borderRadius: 10, padding: 12 }}><Text style={{ color: theme.colors.muted, fontSize: 12 }}>Harita bağlantısında sorun var. İşletme listesini kullanabilirsin.</Text></View> : null}
  </View>;
}
