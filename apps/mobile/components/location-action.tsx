import { AppButton } from "@/components/app-ui";
import { useLocation } from "@/providers/location-provider";
import { Alert } from "@/lib/alert";
export function LocationAction({ onGranted, label = "Konumumu kullan" }: { onGranted?: () => void; label?: string }) {
  const location = useLocation();
  return <AppButton label={label} busy={location.busy} variant="secondary" onPress={() => {
    if (location.position) { onGranted?.(); return; }
    Alert.alert("Yakınındaki işletmeler", "Yaklaşık konumun Salonny sunucusuna işletmeleri sıralamak için gönderilir. Konum profiline kaydedilmez; arka planda takip yapılmaz. Harita karoları OpenStreetMap'ten yüklenir.", [{ text: "Vazgeç", style: "cancel" }, { text: "Konumumu kullan", onPress: async () => { if (await location.requestPosition()) onGranted?.(); } }]);
  }} />;
}
