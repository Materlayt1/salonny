import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Building2, Clock3, MapPin, X } from "lucide-react-native";
import { AppButton, LoadingState } from "@/components/app-ui";
import { FormField } from "@/components/form-field";
import { useManagement } from "@/providers/management-provider";
import { getBusinessProfile, saveBusinessProfile, type BusinessProfile, type BusinessProfileWrite } from "@/lib/business-profile";
import { Alert } from "@/lib/alert";
import { theme } from "@/constants/theme";

const days = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];
type FormProps = { data: BusinessProfile; busy: boolean; onSave: (value: BusinessProfileWrite) => void; onDirty: () => void };
function ProfileForm({ data, busy, onSave, onDirty }: FormProps) {
  const [values, setValues] = useState(data.profile); const [errors, setErrors] = useState<Record<string, string>>({});
  const update = (key: keyof typeof values, value: string) => { onDirty(); setValues((current) => ({ ...current, [key]: value })); setErrors((current) => ({ ...current, [key]: "" })); };
  const submit = () => {
    const next: Record<string, string> = {};
    if (values.name.trim().length < 2) next.name = "En az 2 karakterlik işletme adını gir.";
    const digits = values.phone.replace(/\D/g, "");
    if (values.phone.trim() && (!/^[+\d\s()-]+$/.test(values.phone.trim()) || digits.length < 10 || digits.length > 15)) next.phone = "10–15 rakam içeren geçerli telefon numarasını gir.";
    setErrors(next); if (!Object.keys(next).length) onSave({ action: "profile", ...values });
  };
  return <View style={styles.group}>
    <Text style={styles.note}>Bu bilgiler tüm şubelerin ortak işletme profilinde görünür. İşletmenin bağlantısı ve yayın durumu değişmez.</Text>
    <FormField label="İşletme adı" value={values.name} error={errors.name} onChangeText={(value) => update("name", value)} editable={!busy} maxLength={120} />
    <FormField label="İşletme telefonu" value={values.phone} error={errors.phone} onChangeText={(value) => update("phone", value)} editable={!busy} maxLength={30} keyboardType="phone-pad" textContentType="telephoneNumber" />
    <FormField label="İşletme açıklaması" value={values.description} onChangeText={(value) => update("description", value)} editable={!busy} multiline maxLength={4000} style={styles.multiline} hint="Sunduğun hizmetleri ve işletmeni müşterilerine anlat." />
    <AppButton label="Profili kaydet" busy={busy} onPress={submit} />
  </View>;
}
function AddressForm({ data, busy, onSave, onDirty }: FormProps) {
  const [values, setValues] = useState({ addressLine: data.location?.addressLine ?? "", district: data.location?.district ?? "", city: data.location?.city ?? "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const update = (key: keyof typeof values, value: string) => { onDirty(); setValues((current) => ({ ...current, [key]: value })); setErrors((current) => ({ ...current, [key]: "" })); };
  if (!data.location) return <View style={styles.card}><Text style={styles.heading}>Kayıtlı konum bulunmuyor</Text><Text style={styles.note}>Yeni konum eklemek için haritada doğrulanmış bir nokta seçilmeli. Bu ekran yalnızca kayıtlı şube adresinin yazımını düzeltir; sahte koordinat oluşturmaz.</Text></View>;
  const submit = () => {
    const next: Record<string, string> = {};
    if (values.addressLine.trim().length < 5) next.addressLine = "En az 5 karakterlik açık adresi gir.";
    if (values.district.trim().length < 2) next.district = "İlçe bilgisini gir.";
    if (values.city.trim().length < 2) next.city = "İl bilgisini gir.";
    setErrors(next); if (!Object.keys(next).length) onSave({ action: "address", ...values });
  };
  return <View style={styles.group}>
    <Text style={styles.note}>{data.branchName} şubesinin adres yazımını düzelt. Harita noktası değişmez; taşınma veya yeni konum seçimi bu ekranda desteklenmez.</Text>
    <FormField label="Şube açık adresi" value={values.addressLine} error={errors.addressLine} onChangeText={(value) => update("addressLine", value)} editable={!busy} multiline maxLength={500} style={styles.multiline} />
    <FormField label="Şube ilçesi" value={values.district} error={errors.district} onChangeText={(value) => update("district", value)} editable={!busy} maxLength={100} />
    <FormField label="Şube ili" value={values.city} error={errors.city} onChangeText={(value) => update("city", value)} editable={!busy} maxLength={100} />
    <AppButton label="Şube adresini kaydet" busy={busy} onPress={submit} />
  </View>;
}
function HoursForm({ data, busy, onSave, onDirty }: FormProps) {
  const [rows, setRows] = useState(() => days.map((_, weekday) => { const existing = data.hours.find((row) => row.weekday === weekday); return { weekday, closed: existing?.closed ?? true, opensAt: existing?.opensAt ?? "09:00", closesAt: existing?.closesAt ?? "19:00" }; }));
  const [error, setError] = useState("");
  const update = (weekday: number, patch: Partial<typeof rows[number]>) => { onDirty(); setError(""); setRows((current) => current.map((row) => row.weekday === weekday ? { ...row, ...patch } : row)); };
  const submit = () => {
    if (rows.some((row) => !row.closed && (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(row.opensAt) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(row.closesAt) || row.opensAt >= row.closesAt))) { setError("Açık günlerde saatleri SS:DD biçiminde gir; kapanış açılıştan sonra olmalı."); return; }
    setError("");
    const allClosed = rows.every((row) => row.closed);
    const hours = rows.map((row) => ({ weekday: row.weekday, opensAt: row.closed ? null : row.opensAt, closesAt: row.closed ? null : row.closesAt, closed: row.closed }));
    Alert.alert(allClosed ? "Tüm haftayı kapat" : "Çalışma saatlerini güncelle", allClosed ? `${data.branchName} şubesi tüm hafta yeni randevuya kapalı olacak. Mevcut randevular otomatik iptal edilmez.` : `${data.branchName} şubesinin haftalık saatleri güncellenecek. Mevcut randevular otomatik iptal edilmez; çalışan vardiyaları ve molalar korunur.`, [{ text: "Vazgeç", style: "cancel" }, { text: "Onayla ve kaydet", onPress: () => onSave({ action: "hours", hours, confirmClosure: allClosed }) }]);
  };
  return <View style={styles.group}>
    <Text style={styles.note}>Saat dilimi: {data.timezone}. Çalışma saatleri yalnızca {data.branchName} şubesini etkiler. Kapalı günler yeni randevu için kullanılamaz.</Text>
    {data.hasAdvancedHours ? <Text accessibilityRole="alert" style={styles.error}>Tarihe özel veya çok parçalı çalışma saatleri var. Mevcut planın silinmemesi için haftalık düzenleme kapalı.</Text> : null}
    {rows.map((row) => <View key={row.weekday} style={styles.card}>
      <View style={styles.line}><Text style={styles.label}>{days[row.weekday]}</Text><Switch accessibilityLabel={`${days[row.weekday]} işletme açık`} value={!row.closed} disabled={busy || data.hasAdvancedHours} onValueChange={(open) => update(row.weekday, { closed: !open })} trackColor={{ true: theme.colors.primary }} /></View>
      {row.closed ? <Text style={styles.note}>Kapalı</Text> : <View style={styles.clocks}><View style={styles.clock}><FormField label="Açılış" accessibilityLabel={`${days[row.weekday]} işletme açılış`} value={row.opensAt} editable={!busy && !data.hasAdvancedHours} onChangeText={(opensAt) => update(row.weekday, { opensAt })} maxLength={5} keyboardType="numbers-and-punctuation" inputStyle={styles.clockInput} /></View><View style={styles.clock}><FormField label="Kapanış" accessibilityLabel={`${days[row.weekday]} işletme kapanış`} value={row.closesAt} editable={!busy && !data.hasAdvancedHours} onChangeText={(closesAt) => update(row.weekday, { closesAt })} maxLength={5} keyboardType="numbers-and-punctuation" inputStyle={styles.clockInput} /></View></View>}
    </View>)}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    <AppButton label="Çalışma saatlerini kaydet" busy={busy} disabled={data.hasAdvancedHours} onPress={submit} />
  </View>;
}

export function BusinessProfileEditor({ onClose }: { onClose: () => void }) {
  const { session, user, scope, context } = useManagement(); const client = useQueryClient();
  const [tab, setTab] = useState<"profile" | "address" | "hours">("profile"); const [dirty, setDirty] = useState(false); const [success, setSuccess] = useState(""); const [version, setVersion] = useState(0);
  const allowed = context.data?.role === "OWNER" || context.data?.role === "MANAGER";
  const query = useQuery({ queryKey: ["business-profile", user?.id, scope], queryFn: ({ signal }) => getBusinessProfile(session!.access_token, scope, signal), enabled: Boolean(session && scope.businessId && allowed), retry: false });
  const mutation = useMutation({ mutationFn: (values: BusinessProfileWrite) => saveBusinessProfile(session!.access_token, scope, values), onSuccess: async () => {
    setDirty(false); setSuccess("Kaydedildi.");
    await Promise.all([client.invalidateQueries({ queryKey: ["business-profile", user?.id, scope] }), client.invalidateQueries({ queryKey: ["business-panel"] }), client.invalidateQueries({ queryKey: ["business"] }), client.invalidateQueries({ queryKey: ["businesses"] })]);
    setVersion((current) => current + 1);
  } });
  const busy = mutation.isPending;
  const save = (value: BusinessProfileWrite) => { if (busy) return; setSuccess(""); mutation.mutate(value); };
  const leave = (action: () => void) => { if (busy) return; if (!dirty) action(); else Alert.alert("Kaydedilmemiş değişiklikler", "Bu formdaki değişiklikler kaydedilmedi. Değişiklikleri bırakmak istiyor musun?", [{ text: "Düzenlemeye devam et", style: "cancel" }, { text: "Değişiklikleri bırak", style: "destructive", onPress: () => { setDirty(false); action(); } }]); };
  const changeTab = (next: typeof tab) => { if (next === tab) return; leave(() => { setTab(next); mutation.reset(); setSuccess(""); }); };
  const forms = { profile: ProfileForm, address: AddressForm, hours: HoursForm }; const Form = forms[tab];
  return <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={() => leave(onClose)}>
    <SafeAreaView edges={["top", "left", "right", "bottom"]} style={styles.screen}><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.header}><View style={{ flex: 1 }}><Text style={styles.heading}>İşletme profili</Text><Text style={styles.note}>{query.data?.branchName ?? "Profil ve çalışma saatleri"}</Text></View><Pressable style={styles.close} disabled={busy} accessibilityRole="button" accessibilityLabel="İşletme profilini kapat" onPress={() => leave(onClose)}><X size={24} color={theme.colors.text} /></Pressable></View>
      <View style={styles.tabs}>{[{ key: "profile" as const, label: "Profil", Icon: Building2 }, { key: "address" as const, label: "Adres", Icon: MapPin }, { key: "hours" as const, label: "Saatler", Icon: Clock3 }].map(({ key, label, Icon }) => <Pressable key={key} disabled={busy} accessibilityRole="button" accessibilityLabel={`İşletme ${label.toLocaleLowerCase("tr-TR")}`} accessibilityState={{ selected: key === tab }} onPress={() => changeTab(key)} style={[styles.tab, key === tab && styles.selected]}><Icon size={19} color={theme.colors.primary} /><Text style={styles.label}>{label}</Text></Pressable>)}</View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
        {!allowed ? <Text accessibilityRole="alert" style={styles.error}>İşletme profili için sahip veya yönetici yetkisi gerekiyor.</Text> : query.isPending ? <LoadingState label="İşletme profili yükleniyor..." /> : null}
        {query.isError ? <><Text accessibilityRole="alert" style={styles.error}>{query.error.message}</Text><AppButton label="Profili yeniden yükle" onPress={() => void query.refetch()} /></> : null}
        {mutation.error ? <Text accessibilityRole="alert" style={styles.error}>{mutation.error.message}</Text> : null}
        {success ? <Text accessibilityRole="alert" style={styles.success}>{success}</Text> : null}
        {query.data && allowed ? <Form key={`${tab}-${version}`} data={query.data} busy={busy} onSave={save} onDirty={() => { setDirty(true); setSuccess(""); }} /> : null}
      </ScrollView>
    </KeyboardAvoidingView></SafeAreaView>
  </Modal>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F8F8FA" }, header: { backgroundColor: "#fff", padding: 20, flexDirection: "row", alignItems: "center", gap: 12 }, close: { minHeight: 44, minWidth: 44, alignItems: "center", justifyContent: "center" }, heading: { color: theme.colors.text, fontSize: 20, lineHeight: 28, fontWeight: theme.typography.weight.semibold }, label: { color: theme.colors.text, fontSize: 14, lineHeight: 20, fontWeight: theme.typography.weight.medium }, note: { color: theme.colors.muted, fontSize: 13, lineHeight: 21 }, tabs: { backgroundColor: "#fff", flexDirection: "row", gap: 8, padding: 12 }, tab: { flex: 1, minHeight: 66, borderRadius: 14, alignItems: "center", justifyContent: "center", gap: 5 }, selected: { backgroundColor: theme.colors.primarySoft }, body: { padding: 20, gap: 14, paddingBottom: 48 }, group: { gap: 16 }, card: { backgroundColor: "#fff", borderRadius: 16, borderWidth: 1, borderColor: theme.colors.border, padding: 14, gap: 12 }, line: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }, clocks: { flexDirection: "row", gap: 12 }, clock: { flex: 1, flexBasis: 0, minWidth: 0 }, clockInput: { textAlign: "center", paddingHorizontal: 8 }, multiline: { minHeight: 110, textAlignVertical: "top" }, error: { color: theme.colors.danger, fontSize: 13, lineHeight: 21 }, success: { color: theme.colors.success, fontSize: 14, lineHeight: 21, fontWeight: theme.typography.weight.medium },
});
