import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MapPin, ChevronDown, ChevronRight, ArrowLeft, Check, X } from "lucide-react-native";
import { TURKEY_CITIES, cityKey } from "@salonny/contracts/browse-area";
import { useBrowseArea } from "@/providers/browse-area-provider";
import { theme } from "@/constants/theme";
import { AppButton } from "@/components/app-ui";

export function BrowseAreaSelector() {
  const browse = useBrowseArea();
  const [stage, setStage] = useState<"summary" | "cities" | null>(null);
  const [search, setSearch] = useState("");
  const [requested, setRequested] = useState(false);
  const action = useRef(0);
  useEffect(() => () => { action.current++; }, []);
  const close = () => { action.current++; setStage(null); setSearch(""); setRequested(false); };
  const choose = (city: string) => { browse.select(city); close(); };
  const requestPosition = async () => {
    const ticket = ++action.current;
    setRequested(true);
    const granted = await browse.location.requestPosition();
    // A late permission/location result must not replace a later city choice.
    if (granted && ticket === action.current) choose("auto");
  };
  const cities = TURKEY_CITIES.filter((city) => cityKey(city).includes(cityKey(search)));
  return <View style={styles.outer}>
    <Pressable disabled={!browse.ready} accessibilityRole="button" accessibilityLabel={`Şehir seçimi: ${browse.label}`} accessibilityHint="Arama bölgeni gör ve şehrini değiştir" onPress={() => { action.current++; setRequested(false); setStage("summary"); }} style={styles.trigger}>
      <MapPin size={17} color={theme.colors.primary} /><View style={{ flex: 1 }}><Text style={styles.label}>{browse.label}</Text><Text style={styles.note}>Şehri değiştirmek için dokun</Text></View><ChevronDown size={16} color={theme.colors.muted} />
    </Pressable>
    <Modal visible={stage !== null} transparent animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.overlay}>
        <Pressable accessibilityRole="button" accessibilityLabel="Şehir seçimini kapat" onPress={close} style={StyleSheet.absoluteFill} />
        <SafeAreaView edges={["bottom"]} accessibilityViewIsModal style={styles.sheet} testID="browse-city-sheet">
          <View style={styles.handle} />
          <View style={styles.heading}>
            {stage === "cities" ? <Pressable accessibilityRole="button" accessibilityLabel="Bölge seçeneklerine dön" onPress={() => { action.current++; setSearch(""); setStage("summary"); }} style={styles.close}><ArrowLeft size={21} color={theme.colors.text} /></Pressable> : null}
            <Text accessibilityRole="header" style={styles.title}>{stage === "cities" ? "Şehri değiştir" : "Arama bölgen"}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Şehir seçimini kapat" onPress={close} style={styles.close}><X size={22} color={theme.colors.text} /></Pressable>
          </View>
          {stage === "summary" ? <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.summary} style={{ flexGrow: 0 }}>
            <View style={styles.current}><View style={styles.currentIcon}><MapPin size={23} color={theme.colors.primary} /></View><View style={{ flex: 1 }}><Text style={styles.note}>Şu an gösterilen bölge</Text><Text style={styles.currentLabel}>{browse.label}</Text><Text style={styles.note}>{browse.area.radius ? "Yalnız 25 km çevrendeki işletmeler." : browse.area.city ? "Yalnız seçtiğin şehirdeki işletmeler." : "Türkiye genelindeki yayındaki işletmeler."}</Text></View></View>
            <Pressable accessibilityRole="button" accessibilityLabel="Şehri değiştir" onPress={() => setStage("cities")} style={styles.change}><MapPin size={19} color={theme.colors.primary} /><View style={{ flex: 1 }}><Text style={styles.changeLabel}>Şehri değiştir</Text><Text style={styles.note}>81 şehir arasından seçim yap</Text></View><ChevronRight size={19} color={theme.colors.primary} /></Pressable>
            <AppButton label="Konumumu kullan · 25 km" busy={browse.location.busy} variant="secondary" onPress={() => void requestPosition()} />
            <AppButton label="Tüm şehirleri göster" variant="ghost" onPress={() => choose("all")} />
          </ScrollView> : <>
            <Text style={styles.note}>İşletmeleri görmek istediğin şehri seç.</Text>
            <TextInput accessibilityLabel="Şehir ara" placeholder="Şehir ara…" placeholderTextColor={theme.colors.muted} value={search} onChangeText={setSearch} autoCapitalize="words" autoCorrect={false} style={styles.input} />
            <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === "web" ? "none" : "on-drag"} contentContainerStyle={styles.options}>
              {cities.map((city) => <Pressable key={city} accessibilityRole="button" accessibilityLabel={city} accessibilityState={{ selected: browse.selection === city }} {...(Platform.OS === "web" ? { "aria-pressed": browse.selection === city } : {})} onPress={() => choose(city)} style={[styles.option, browse.selection === city && styles.selected]}><Text style={styles.label}>{city}</Text>{browse.selection === city ? <Check size={18} color={theme.colors.primary} /> : null}</Pressable>)}
              {!cities.length ? <View style={styles.noResults}><Text style={styles.label}>Şehir bulunamadı</Text><Text style={styles.note}>Şehir adını kontrol et veya aramayı temizle.</Text><AppButton label="Aramayı temizle" variant="ghost" onPress={() => setSearch("")} /></View> : null}
            </ScrollView>
          </>}
          {requested && browse.location.error ? <Text accessibilityRole="alert" style={styles.error}>{browse.location.error}</Text> : null}
          <Text style={styles.note}>Seçimin ana sayfa ve keşfette birlikte uygulanır. GPS koordinatları kaydedilmez.</Text>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  </View>;
}
const styles = StyleSheet.create({
  outer: { marginHorizontal: 20, marginBottom: 12 },
  trigger: { minHeight: 58, flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 14, backgroundColor: "#FBFAFF" },
  label: { color: theme.colors.text, fontSize: 14, fontWeight: "500" }, note: { color: theme.colors.muted, fontSize: 11, lineHeight: 17 },
  overlay: { flex: 1, backgroundColor: theme.colors.overlay, justifyContent: "flex-end" },
  sheet: { maxHeight: "88%", width: "100%", maxWidth: 560, alignSelf: "center", backgroundColor: "white", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, gap: 12 },
  handle: { width: 38, height: 4, borderRadius: 3, backgroundColor: theme.colors.border, alignSelf: "center" },
  heading: { flexDirection: "row", alignItems: "center", gap: 4 }, title: { flex: 1, fontSize: 22, fontWeight: "600", color: theme.colors.text },
  close: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  current: { padding: 16, backgroundColor: "#FAF9FD", borderRadius: 16, flexDirection: "row", alignItems: "center", gap: 12 },
  currentIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: theme.colors.primarySoft, alignItems: "center", justifyContent: "center" },
  currentLabel: { color: theme.colors.text, fontSize: 19, fontWeight: "600", marginVertical: 4 },
  change: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, minHeight: 68, borderWidth: 1, borderColor: "#DCD3FC", borderRadius: 14 },
  changeLabel: { color: theme.colors.primary, fontSize: 15, fontWeight: "500", marginBottom: 3 },
  input: { minHeight: 48, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 12, paddingHorizontal: 13, color: theme.colors.text },
  summary: { gap: 12 }, options: { gap: 4 }, option: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, borderRadius: 10 },
  selected: { backgroundColor: theme.colors.primarySoft }, noResults: { gap: 8, padding: 16 }, error: { color: theme.colors.danger, fontSize: 12 },
});
