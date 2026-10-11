import { useState } from "react";
import { Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { SlidersHorizontal, X, Search } from "lucide-react-native";
import { AppButton, Chip } from "@/components/app-ui";
import { theme } from "@/constants/theme";
import { defaultBusinessFilters, filterCount, sortLabels, type BusinessFilters } from "@/lib/business-filters";

export function DirectorySearch({ value, onChange, onFilters, count, label = "İşletme veya hizmet ara", ready = true }: { value: string; onChange: (value: string) => void; onFilters: () => void; count: number; label?: string; ready?: boolean }) {
  return <View style={styles.toolbar}>
    <View style={styles.search}><Search size={18} color={theme.colors.muted} /><TextInput accessibilityLabel={label} editable={ready} value={value} onChangeText={onChange} placeholder="İşletme veya hizmet ara" placeholderTextColor={theme.colors.muted} returnKeyType="search" onSubmitEditing={Keyboard.dismiss} autoCapitalize="none" style={styles.searchInput} />{value ? <Pressable accessibilityRole="button" accessibilityLabel="Aramayı temizle" onPress={() => onChange("")} style={styles.clear}><X size={17} color={theme.colors.muted} /></Pressable> : null}</View>
    <Pressable accessibilityRole="button" accessibilityLabel={`Filtreler${count ? `, ${count} etkin` : ""}`} disabled={!ready} onPress={() => { Keyboard.dismiss(); onFilters(); }} style={[styles.filterButton, count > 0 && styles.activeButton]}><SlidersHorizontal size={19} color={theme.colors.primaryDark} /><Text style={styles.filterText}>Filtreler{count ? ` · ${count}` : ""}</Text></Pressable>
  </View>;
}

/** Mounted only while open: cancelling discards the draft, not the applied search. */
export function BusinessFilterSheet({ value, categories, allowNearest = false, onApply, onClose }: { value: BusinessFilters; categories: { id: string; name: string }[]; allowNearest?: boolean; onApply: (value: BusinessFilters) => void; onClose: () => void }) {
  const [draft, setDraft] = useState<BusinessFilters>(() => ({ ...value }));
  return <Modal visible transparent animationType="slide" onRequestClose={onClose}>
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.overlay}>
      <Pressable accessibilityRole="button" accessibilityLabel="Filtre panelini kapat" onPress={onClose} style={StyleSheet.absoluteFill} />
      <SafeAreaView edges={["bottom"]} accessibilityViewIsModal style={styles.sheet} testID="business-filter-sheet">
        <View style={styles.handle} />
        <View style={styles.header}><View style={{ flex: 1 }}><Text accessibilityRole="header" style={styles.title}>Filtreler</Text><Text style={styles.note}>{filterCount(draft)} etkin filtre · değişiklikler uygulayınca kaydedilir</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Filtreleri kapat" onPress={onClose} style={styles.clear}><X size={23} color={theme.colors.text} /></Pressable></View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
          <Text style={styles.label}>Kategori</Text><View style={styles.wrap}><Chip label="Tümü" selected={!draft.category} onPress={() => setDraft((prev) => ({ ...prev, category: "" }))} />{categories.map((category) => <Chip key={category.id} label={category.name} selected={draft.category === category.id} onPress={() => setDraft((prev) => ({ ...prev, category: category.id }))} />)}</View>
          <Text style={styles.label}>Şehir</Text><TextInput accessibilityLabel="Şehir filtresi" placeholder="Örn. İzmir" placeholderTextColor={theme.colors.muted} value={draft.city} onChangeText={(city) => setDraft((prev) => ({ ...prev, city }))} autoCapitalize="words" maxLength={80} style={styles.city} />
          <Text style={styles.label}>Sıralama</Text><View style={styles.wrap}>{(Object.entries(sortLabels) as [BusinessFilters["sort"], string][]).filter(([sort]) => sort !== "nearest" || allowNearest).map(([sort, label]) => <Chip key={sort} label={label} selected={draft.sort === sort} onPress={() => setDraft((prev) => ({ ...prev, sort }))} />)}</View>
          <View style={styles.openRow}><View style={{ flex: 1 }}><Text style={styles.label}>Şu an açık</Text><Text style={styles.note}>Yalnız açık işletmeleri göster</Text></View><Switch accessibilityLabel="Yalnız şu an açık işletmeler" value={draft.open} onValueChange={(open) => setDraft((prev) => ({ ...prev, open }))} trackColor={{ true: theme.colors.primary }} /></View>
        </ScrollView>
        <View style={styles.actions}><AppButton label="Sıfırla" variant="ghost" onPress={() => setDraft({ ...defaultBusinessFilters })} style={{ flex: 1 }} /><AppButton label="Filtreleri uygula" onPress={() => { Keyboard.dismiss(); onApply({ ...draft, city: draft.city.trim(), sort: !allowNearest && draft.sort === "nearest" ? "recommended" : draft.sort }); }} style={{ flex: 2 }} /></View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  </Modal>;
}

const styles = StyleSheet.create({
  toolbar: { flexDirection: "row", gap: 8, paddingHorizontal: 20, paddingVertical: 10, backgroundColor: "#fff" },
  search: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 13, paddingLeft: 12 }, searchInput: { flex: 1, minWidth: 0, color: theme.colors.text, fontSize: 14, paddingVertical: 13, paddingRight: 4 }, clear: { minWidth: 48, minHeight: 48, alignItems: "center", justifyContent: "center" }, filterButton: { minHeight: 48, paddingHorizontal: 12, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 13, flexDirection: "row", alignItems: "center", gap: 6 }, activeButton: { backgroundColor: theme.colors.primarySoft, borderColor: "#D9CFFF" }, filterText: { color: theme.colors.primaryDark, fontSize: 12, fontWeight: theme.typography.weight.medium },
  overlay: { flex: 1, backgroundColor: theme.colors.overlay, justifyContent: "flex-end" }, sheet: { maxHeight: "88%", width: "100%", maxWidth: 560, alignSelf: "center", backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24 }, handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: theme.colors.border, alignSelf: "center", marginTop: 10 }, header: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: theme.colors.border }, title: { color: theme.colors.text, fontSize: 22, fontWeight: theme.typography.weight.semibold }, note: { color: theme.colors.muted, fontSize: 12, lineHeight: 19 }, body: { padding: 20, gap: 12 }, label: { color: theme.colors.text, fontSize: 14, fontWeight: theme.typography.weight.medium }, wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, city: { minHeight: 48, borderColor: theme.colors.border, borderWidth: 1, borderRadius: 12, padding: 13, color: theme.colors.text, fontSize: 15 }, openRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 8, paddingVertical: 12 }, actions: { flexDirection: "row", gap: 10, padding: 20, borderTopWidth: 1, borderTopColor: theme.colors.border },
});
