import { lazy, Suspense } from "react";
import Constants, { ExecutionEnvironment } from "expo-constants";
import { Text, View } from "react-native";
import { LoadingState } from "@/components/app-ui";
import type { BusinessMapProps } from "@/lib/map";
const NativeMap = lazy(() => import("./business-map-native"));
export function BusinessMap(props: BusinessMapProps) {
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return <View style={{ height: props.height ?? 300, backgroundColor: "#F0ECFF", padding: 24, justifyContent: "center" }}><Text style={{ color: "#5635E6", fontWeight: "600" }}>Harita için Salonny özel uygulama build’i gerekiyor.</Text><Text style={{ marginTop: 8, color: "#686872" }}>Expo Go harita modülünü içermez. İşletme listesini kullanabilirsin.</Text></View>;
  return <Suspense fallback={<LoadingState label="Harita hazırlanıyor..." />}><NativeMap {...props} /></Suspense>;
}
