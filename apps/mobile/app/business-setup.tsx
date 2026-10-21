import { useEffect, useRef, useState } from "react";
import { router, useLocalSearchParams, useNavigation, type Href } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import * as Crypto from "expo-crypto";
import * as ImagePicker from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { AppButton, BrandHeader, Chip, EmptyState, LoadingState, Screen } from "@/components/app-ui";
import { SetupLocationPicker } from "@/components/setup-location-picker";
import { useAuth } from "@/providers/auth-provider";
import { getBusinessSetup, saveBusinessSetup, type BusinessSetupState, type BusinessSetupInput, type SetupScope } from "@/lib/business-setup";
import { Alert } from "@/lib/alert";
import { theme } from "@/constants/theme";

function Field({ label, value, onChange, multiline = false, numeric = false, disabled = false, maxLength = 500 }: { label: string; value: string; onChange: (value: string) => void; multiline?: boolean; numeric?: boolean; disabled?: boolean; maxLength?: number }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={onChange} editable={!disabled} multiline={multiline} maxLength={maxLength} keyboardType={numeric ? "decimal-pad" : "default"} autoCapitalize={label.includes("posta") || label.includes("Web") ? "none" : "sentences"} style={[styles.input, multiline && { minHeight: 100, textAlignVertical: "top" }]} /></View>;
}
export default function BusinessSetupScreen() {
  const { session, user, loading } = useAuth();
  const params = useLocalSearchParams<{ businessId?: string; branchId?: string }>();
  if (loading) return <Screen><LoadingState label="Oturum hazırlanıyor..." /></Screen>;
  if (!session || !user) return <Screen><BrandHeader /><EmptyState title="İşletmeni Salonny'ye ekle" detail="İşletme kurulumu için kendi hesabınla giriş yap." action={<AppButton label="Giriş yap" onPress={() => router.push("/auth")} />} /></Screen>;
  return <SetupContent key={`${user.id}:${session.access_token}:${params.businessId}:${params.branchId}`} token={session.access_token} userId={user.id} scope={{ businessId: params.businessId, branchId: params.branchId }} />;
}
function SetupContent({ token, userId, scope }: { token: string; userId: string; scope: SetupScope }) {
  const [imageOffset, setImageOffset] = useState(0);
  const [step, setStep] = useState(0);
  const query = useQuery({ queryKey: ["business-setup", userId, token, scope.businessId, scope.branchId, imageOffset], queryFn: ({ signal }) => getBusinessSetup(token, scope, imageOffset, signal), retry: false });
  if (query.isPending) return <Screen><LoadingState label="İşletme kurulumun yükleniyor..." /></Screen>;
  if (query.error || !query.data) return <Screen><EmptyState title="Kurulum açılamadı" detail={query.error?.message} action={<AppButton label="Kurulumu yeniden yükle" onPress={() => void query.refetch()} />} /></Screen>;
  return <SetupEditor key={`${query.data.business?.id ?? "new"}:${query.data.business?.branchId ?? ""}`} state={query.data} token={token} refreshing={query.isFetching} reload={async () => (await query.refetch()).data} setImageOffset={setImageOffset} step={step} setStep={setStep} />;
}
function SetupEditor({ state, token, refreshing, reload, setImageOffset, step, setStep }: { state: BusinessSetupState; token: string; refreshing: boolean; reload: () => Promise<BusinessSetupState | undefined>; setImageOffset: (value: number) => void; step: number; setStep: (value: number) => void }) {
  const business = state.business; const queryClient = useQueryClient(); const navigation = useNavigation();
  const [name, setName] = useState(""); const [description, setDescription] = useState("");
  const [profileRevision, setProfileRevision] = useState(business?.revision ?? "");
  const [locationSnapshot, setLocationSnapshot] = useState(state.location);
  const [profile, setProfile] = useState(() => business?.profile ?? { name: "", description: "", phone: "", whatsappPhone: "", email: "", websiteUrl: "", categoryId: null as string | null });
  const [address, setAddress] = useState(() => ({ id: state.location?.id ?? Crypto.randomUUID(), addressLine: state.location?.addressLine ?? "", district: state.location?.district ?? "", city: state.location?.city ?? "", postalCode: state.location?.postalCode ?? "", latitude: state.location ? String(state.location.latitude) : "", longitude: state.location ? String(state.location.longitude) : "" }));
  const [image, setImage] = useState<{ id: string; uri: string; base64: string } | null>(null); const [processing, setProcessing] = useState(false); const [localError, setLocalError] = useState(""); const [message, setMessage] = useState("");
  const alive = useRef(true); const allowLeave = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const selectedScope = { businessId: business?.id, branchId: business?.branchId };
  const mutation = useMutation({
    mutationFn: (values: BusinessSetupInput) => saveBusinessSetup(token, selectedScope, values),
    onSuccess: async (result, values) => {
      if (!alive.current) return;
      if (values.action === "start") {
        if (!result.businessId || !result.branchId) { setLocalError("İşletme sonucu doğrulanamadı. Yeniden yükle."); return; }
        allowLeave.current = true;
        router.replace(`/business-setup?${new URLSearchParams({ businessId: result.businessId, branchId: result.branchId })}` as Href);
        await queryClient.invalidateQueries({ queryKey: ["session-summary"] }); return;
      }
      if (values.action === "submit") { setMessage(result.submitted ? result.status === "published" ? "İşletmen zaten yayında; yayın durumu değişmedi." : "İşletmen incelemeye gönderildi. Otomatik yayınlanmaz." : `Eksik adımlar: ${(result.missing ?? []).join(", ")}`); }
      else setMessage("Değişiklik kaydedildi.");
      const fresh = await reload();
      if (!alive.current) return;
      if (values.action === "profile" && fresh?.business) { setProfile(fresh.business.profile); setProfileRevision(fresh.business.revision); }
      if (values.action === "location" && fresh?.location) { setAddress({ ...fresh.location, latitude: String(fresh.location.latitude), longitude: String(fresh.location.longitude) }); setLocationSnapshot(fresh.location); }
      if (values.action === "image") setImage(null);
      await queryClient.invalidateQueries({ queryKey: ["business-panel", "context"] });
    },
  });
  const busy = mutation.isPending || processing || refreshing;
  const dirty = business ? JSON.stringify(profile) !== JSON.stringify(business.profile) || Boolean(image) || (state.location ? ["addressLine", "district", "city", "postalCode"].some((key) => address[key as keyof typeof address] !== state.location![key as "addressLine"]) || Number(address.latitude.replace(",", ".")) !== state.location.latitude || Number(address.longitude.replace(",", ".")) !== state.location.longitude : Object.entries(address).some(([key, value]) => key !== "id" && Boolean(value))) : Boolean(name || description);
  usePreventRemove(dirty || busy, ({ data }) => {
    if (allowLeave.current) { navigation.dispatch(data.action); return; }
    if (busy) return;
    Alert.alert("Kaydedilmemiş değişiklikler", "Yerel taslağı bırakıp bu ekrandan çıkmak istiyor musun?", [{ text: "Kal", style: "cancel" }, { text: "Taslağı bırak", style: "destructive", onPress: () => { allowLeave.current = true; navigation.dispatch(data.action); } }]);
  });
  const save = (values: BusinessSetupInput) => { if (busy) return; setLocalError(""); setMessage(""); mutation.mutate(values); };
  const reloadDraft = async () => {
    const fresh = await reload();
    if (!alive.current || !fresh?.business) return;
    setProfile(fresh.business.profile); setProfileRevision(fresh.business.revision); setLocationSnapshot(fresh.location);
    setAddress({ id: fresh.location?.id ?? Crypto.randomUUID(), addressLine: fresh.location?.addressLine ?? "", district: fresh.location?.district ?? "", city: fresh.location?.city ?? "", postalCode: fresh.location?.postalCode ?? "", latitude: fresh.location ? String(fresh.location.latitude) : "", longitude: fresh.location ? String(fresh.location.longitude) : "" });
    setImage(null); mutation.reset(); setLocalError(""); setMessage("Güncel kayıt yüklendi.");
  };
  const chooseImage = async () => {
    if (busy) return;
    try {
      const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: false, quality: 1, allowsMultipleSelection: false, exif: false });
      if (picked.canceled || !alive.current) return;
      const asset = picked.assets[0];
      if (!asset || (asset.fileSize ?? 0) > 15 * 1024 * 1024 || asset.width * asset.height > 40_000_000 || /svg|gif/i.test(`${asset.mimeType ?? ""} ${asset.fileName ?? ""}`)) throw new Error("15 MB altında, tek kareli bir işletme fotoğrafı seç. SVG/GIF desteklenmez.");
      setProcessing(true); setLocalError("");
      const context = ImageManipulator.manipulate(asset.uri);
      try {
        if (Math.max(asset.width, asset.height) > 1600) context.resize(asset.width >= asset.height ? { width: 1600 } : { height: 1600 });
        const rendered = await context.renderAsync();
        try {
          const encoded = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.8, base64: true });
          if (!encoded.base64 || encoded.base64.length > 2_800_000) throw new Error("Görsel fazla büyük. Daha küçük bir fotoğraf seç.");
          if (alive.current) setImage({ id: Crypto.randomUUID(), uri: encoded.uri, base64: encoded.base64 });
        } finally { rendered.release(); }
      } finally { context.release(); }
    } catch (error) { if (alive.current) setLocalError(error instanceof Error ? error.message : "Fotoğraf seçilemedi."); }
    finally { if (alive.current) setProcessing(false); }
  };
  const latitude = Number(address.latitude.replace(",", ".")); const longitude = Number(address.longitude.replace(",", "."));
  const point = address.latitude.trim() && address.longitude.trim() && Number.isFinite(latitude) && Number.isFinite(longitude) && latitude >= 35 && latitude <= 43 && longitude >= 25 && longitude <= 46 ? { latitude, longitude } : null;
  const steps = ["Profil ve kategori", "Konum", "Fotoğraflar", "Son kontroller"];
  const statusLabels = { draft: "Taslak", pending_review: "İnceleme bekliyor", published: "Yayında", suspended: "Askıya alınmış" };
  return <Screen><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}><ScrollView testID="business-setup-content" contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <BrandHeader /><Text style={styles.heading}>{business ? "İşletme kurulumu ve görseller" : "İşletmeni Salonny'ye ekle"}</Text>
    <Text style={styles.note}>Aynı Salonny hesabı ve veritabanı. Ödeme yok; taslak kendi kendine yayınlanmaz.</Text>
    {localError || mutation.error ? <Text accessibilityRole="alert" style={styles.error}>{localError || mutation.error?.message}</Text> : null}
    {message ? <Text accessibilityRole="alert" style={styles.success}>{message}</Text> : null}
    {!business ? <View style={styles.card}><Field label="İşletme adı" value={name} onChange={setName} maxLength={120} disabled={busy} /><Field label="İşletme açıklaması" value={description} onChange={setDescription} multiline maxLength={4000} disabled={busy} /><Text style={styles.note}>İlk işletme taslağın varsa devam edilir. Yeni profilin inceleme tamamlanmadan müşterilere açık değildir.</Text><AppButton label="İşletme taslağını başlat" busy={busy} onPress={() => Alert.alert("İşletme taslağı oluştur", "Hesabın işletme sahibi olarak kaydedilecek. Taslak otomatik yayınlanmaz.", [{ text: "Vazgeç", style: "cancel" }, { text: "Taslağı başlat", onPress: () => save({ action: "start", name, description }) }])} /></View> : <>
      <View style={styles.card}><Text style={styles.label}>{business.profile.name} · {business.branchName}</Text><Text style={styles.note}>{statusLabels[business.status]} · {state.timezone}</Text><Text style={styles.note}>Profil ve görseller tüm işletmeye, konum ise seçili şubeye aittir.</Text></View>
      <View style={styles.wrap}>{steps.map((label, index) => <Chip key={label} label={`${index + 1}. ${label}`} selected={step === index} onPress={() => { if (!busy) setStep(index); }} />)}</View>
      {step === 0 ? <View style={styles.card}>
        <Field label="İşletme adı" value={profile.name} onChange={(value) => setProfile({ ...profile, name: value })} maxLength={120} disabled={busy} />
        <Field label="İşletme açıklaması" value={profile.description} onChange={(value) => setProfile({ ...profile, description: value })} multiline maxLength={4000} disabled={busy} />
        <Text style={styles.label}>Kategori</Text><View style={styles.wrap}>{state.categories.map((category) => <Chip key={category.id} label={category.name} selected={profile.categoryId === category.id} onPress={() => { if (!busy) setProfile({ ...profile, categoryId: category.id }); }} />)}</View>
        {(["phone", "whatsappPhone", "email", "websiteUrl"] as const).map((key) => <Field key={key} label={{ phone: "İşletme telefonu", whatsappPhone: "WhatsApp telefonu", email: "İşletme e-posta", websiteUrl: "Web sitesi" }[key]} value={profile[key]} onChange={(value) => setProfile({ ...profile, [key]: value })} maxLength={key === "email" ? 254 : key === "websiteUrl" ? 500 : 30} disabled={busy} />)}
        <AppButton label="Profili kaydet" busy={busy} onPress={() => save({ action: "profile", profile, expectedRevision: profileRevision })} />
      </View> : null}
{step === 1 ? <View style={styles.card}><Text style={styles.label}>Şube konumu</Text><Text style={styles.note}>Haritada işletmenin giriş noktasını seç. Konum otomatik alınmaz; kaydetmeden değiştirilmez.</Text><SetupLocationPicker point={point} onChange={(value) => { if (!busy) setAddress({ ...address, latitude: String(value.latitude), longitude: String(value.longitude) }); }} />{(["addressLine", "district", "city", "postalCode", "latitude", "longitude"] as const).map((key) => <Field key={key} label={{ addressLine: "Açık adres", district: "İlçe", city: "İl", postalCode: "Posta kodu", latitude: "Enlem", longitude: "Boylam" }[key]} value={address[key]} onChange={(value) => setAddress({ ...address, [key]: value })} disabled={busy} numeric={key === "latitude" || key === "longitude"} />)}<AppButton label="Konumu kaydet" busy={busy} onPress={() => { if (!point) { setLocalError("Geçerli enlem ve boylam seç."); return; } save({ action: "location", location: { ...address, latitude: Number(point.latitude.toFixed(6)), longitude: Number(point.longitude.toFixed(6)) }, expected: locationSnapshot }); }} /></View> : null}
{step === 2 ? <View style={styles.card}><Text style={styles.label}>Kapak ve galeri · {state.totalImages} / 50 görsel</Text><Text style={styles.note}>Seçtiğin görsel işletme profilinde herkese açık olur. Konum/EXIF bilgileri sunucuda kaldırılır; fotoğrafın kendisindeki özel bilgileri ayrıca kontrol et.</Text><AppButton label="Fotoğraf seç" variant="secondary" disabled={busy || state.totalImages >= 50} onPress={() => void chooseImage()} />{processing ? <LoadingState label="Fotoğraf hazırlanıyor..." /> : null}{image ? <View style={styles.photo}><Image source={{ uri: image.uri }} style={styles.preview} alt="Yayınlanmadan önce seçilen fotoğraf" accessibilityLabel="Yayınlanmadan önce seçilen fotoğraf" /><AppButton label="Seçtiğim görseli yayınla" busy={busy} onPress={() => save({ action: "image", id: image.id, base64: image.base64, altText: `${business.profile.name} işletme görseli`.slice(0, 160) })} /><AppButton label="Seçimi kaldır" variant="ghost" disabled={busy} onPress={() => setImage(null)} /></View> : null}{state.images.map((item) => <View key={item.id} style={styles.photo}><Image source={{ uri: item.url }} style={styles.preview} alt={item.altText} accessibilityLabel={item.altText} /><Text style={styles.note}>{item.kind === "cover" ? "Kapak görseli" : item.kind === "logo" ? "Logo" : "Galeri"}</Text>{item.kind !== "cover" ? <AppButton label="Kapak olarak seç" variant="secondary" disabled={busy} onPress={() => save({ action: "cover", id: item.id, expectedCoverIds: state.coverIds })} /> : null}</View>)}<View style={styles.wrap}>{state.imageOffset > 0 ? <AppButton label="Önceki fotoğraflar" variant="ghost" disabled={busy || dirty} onPress={() => setImageOffset(state.imageOffset - 25)} /> : null}{state.hasMoreImages ? <AppButton label="Sonraki fotoğraflar" variant="ghost" disabled={busy || dirty} onPress={() => setImageOffset(state.imageOffset + 25)} /> : null}</View></View> : null}
      {step === 3 ? <View style={styles.card}><Text style={styles.label}>Eksiksiz profil kontrolü</Text>{[["Kategori", Boolean(business.profile.categoryId)], ["Şube konumu", Boolean(state.location)], ["Telefon", Boolean(business.profile.phone)], ["Fotoğraflar", state.totalImages > 0], ["Açık çalışma günü", state.readiness.openDays > 0], ["Aktif hizmet", state.readiness.activeServices > 0], ["Aktif uzman", state.readiness.activeEmployees > 0], ["Randevu ayarları", state.readiness.settingsPresent]].map(([label, done]) => <Text key={String(label)} style={styles.note}>{done ? "✓" : "○"} {String(label)}</Text>)}<Text style={styles.note}>Hizmet, uzman, saat ve ayarları mevcut native işletme panelinden tamamla. İncelemeye gönderme, yayına alma değildir; sunucu son kez eksikleri kontrol eder.</Text><AppButton label="Native işletme panelini aç" variant="secondary" disabled={busy || dirty} onPress={() => { allowLeave.current = true; router.push({ pathname: "/manage/[section]", params: { section: "settings", businessId: business.id, branchId: business.branchId } }); }} /><AppButton label="İncelemeye gönder" busy={busy} disabled={business.role !== "OWNER" || dirty} onPress={() => Alert.alert("İncelemeye gönder", "İşletme profilin eksiksizse inceleme beklemeye alınacak; otomatik yayın yapılmaz.", [{ text: "Vazgeç", style: "cancel" }, { text: "Gönder", onPress: () => save({ action: "submit" }) }])} />{dirty ? <Text style={styles.note}>Önce değişiklikleri ilgili adımda kaydet veya taslağı bırak.</Text> : null}</View> : null}
    </>}
    {dirty ? <Text style={styles.note}>Kaydedilmemiş değişikliklerin var. Fotoğraf sayfasını değiştirmeden veya panele geçmeden önce ilgili adımda kaydet.</Text> : null}
    {business ? <AppButton label="Güncel kurulum kaydını yükle" variant="secondary" disabled={busy} onPress={() => dirty ? Alert.alert("Güncel kaydı yükle", "Kaydedilmemiş profil, konum ve fotoğraf seçimlerini bırakıp sunucudaki güncel kaydı yüklemek istiyor musun?", [{ text: "Vazgeç", style: "cancel" }, { text: "Yükle", onPress: () => void reloadDraft() }]) : void reloadDraft()} /> : null}
    <AppButton label="Profilime dön" variant="ghost" disabled={busy} onPress={() => router.back()} />
  </ScrollView></KeyboardAvoidingView></Screen>;
}
const styles = StyleSheet.create({ content: { padding: 20, paddingBottom: 44, gap: 16 }, heading: { color: theme.colors.text, fontSize: 24, fontWeight: theme.typography.weight.semibold, lineHeight: 32 }, note: { color: theme.colors.muted, fontSize: 13, lineHeight: 21 }, label: { color: theme.colors.text, fontSize: 14, fontWeight: theme.typography.weight.medium }, field: { gap: 7 }, input: { padding: 13, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: "#fff", borderRadius: 12, fontSize: 15, color: theme.colors.text }, card: { padding: 16, gap: 14, backgroundColor: "#fff", borderWidth: 1, borderColor: theme.colors.border, borderRadius: 16 }, wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, error: { color: theme.colors.danger, fontSize: 13, lineHeight: 21 }, success: { color: theme.colors.primaryDark, fontSize: 13, lineHeight: 21 }, photo: { gap: 10, paddingVertical: 8 }, preview: { width: "100%", height: 200, borderRadius: 12, backgroundColor: theme.colors.border } });
