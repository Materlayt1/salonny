import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MapPin, ChevronDown, X } from "lucide-react-native";
import { TURKEY_CITIES, cityKey } from "@salonny/contracts/browse-area";
import { useBrowseArea } from "@/providers/browse-area-provider";
import { theme } from "@/constants/theme";
import { AppButton } from "@/components/app-ui";
export function BrowseAreaSelector() {
  const browse = useBrowseArea();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const choose = (city: string) => { browse.select(city); setOpen(false); setSearch(""); };
  return <View style={styles.outer}>
    <Pressable disabled={!browse.ready} accessibilityRole="button" accessibilityLabel={`Şehir seçimi: ${browse.label}`} onPress={() => setOpen(true)} style={styles.trigger}><MapPin size={17} color={theme.colors.primary} /><View style={{ flex: 1 }}><Text style={styles.label}>{browse.label}</Text><Text style={styles.note}>Şehir seç veya yalnız yakınındakileri gör</Text></View><ChevronDown size={16} color={theme.colors.muted} /></Pressable>
    <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
      <View style={styles.overlay}><Pressable accessibilityRole="button" accessibilityLabel="Şehir seçimini kapat" onPress={() => setOpen(false)} style={StyleSheet.absoluteFill} /><SafeAreaView edges={["bottom"]} accessibilityViewIsModal style={styles.sheet} testID="browse-city-sheet">
        <View style={styles.heading}><Text accessibilityRole="header" style={styles.title}>Nerede arayalım?</Text><Pressable accessibilityRole="button" accessibilityLabel="Şehir seçimini kapat" onPress={() => setOpen(false)} style={styles.close}><X size={22} color={theme.colors.text} /></Pressable></View>
        <TextInput accessibilityLabel="Şehir ara" placeholder="Şehir ara…" placeholderTextColor={theme.colors.muted} value={search} onChangeText={setSearch} style={styles.input} />
        <AppButton label="Konumumu kullan · 25 km" busy={browse.location.busy} variant="secondary" onPress={() => { void browse.location.requestPosition().then((ready) => { if (ready) choose("auto"); }); }} />
        {browse.location.error ? <Text accessibilityRole="alert" style={styles.error}>{browse.location.error}</Text> : null}
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.options}>
          {!search.trim() ? <Pressable accessibilityRole="button" accessibilityLabel="Tüm şehirleri göster" onPress={() => choose("all")} style={styles.option}><Text style={styles.label}>Tüm şehirler</Text><Text style={styles.note}>Türkiye genelindeki sonuçları bilerek göster</Text></Pressable> : null}
          {TURKEY_CITIES.filter((city) => cityKey(city).includes(cityKey(search))).map((city) => <Pressable key={city} accessibilityRole="button" accessibilityState={{ selected: browse.selection === city }} onPress={() => choose(city)} style={[styles.option, browse.selection === city && styles.selected]}><Text style={styles.label}>{city}</Text></Pressable>)}
        </ScrollView>
        <Text style={styles.note}>Şehir seçimi konumdan önceliklidir. Sonuç yoksa başka şehir eklenmez. GPS koordinatları kaydedilmez.</Text>
      </SafeAreaView></View>
    </Modal>
  </View>;
}
const styles = StyleSheet.create({ outer: { marginHorizontal: 20, marginBottom: 12 }, trigger: { minHeight: 58, flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 14, backgroundColor: "#FBFAFF" }, label: { color: theme.colors.text, fontSize: 14, fontWeight: "500" }, note: { color: theme.colors.muted, fontSize: 11, lineHeight: 17 }, overlay: { flex: 1, backgroundColor: theme.colors.overlay, justifyContent: "flex-end" }, sheet: { maxHeight: "88%", width: "100%", maxWidth: 560, alignSelf: "center", backgroundColor: "white", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, gap: 12 }, heading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, title: { fontSize: 22, fontWeight: "600", color: theme.colors.text }, close: { width: 48, height: 48, alignItems: "center", justifyContent: "center" }, input: { minHeight: 48, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 12, paddingHorizontal: 13, color: theme.colors.text }, options: { gap: 4 }, option: { minHeight: 48, justifyContent: "center", paddingHorizontal: 14, borderRadius: 10 }, selected: { backgroundColor: theme.colors.primarySoft }, error: { color: theme.colors.danger, fontSize: 12 } });
