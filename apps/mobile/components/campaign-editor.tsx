import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Megaphone, X } from "lucide-react-native";
import { AppButton, Chip, LoadingState } from "@/components/app-ui";
import { FormField } from "@/components/form-field";
import { theme } from "@/constants/theme";
import { Alert } from "@/lib/alert";
import { getCampaignEditor, saveCampaign, type CampaignAudience, type CampaignEditorData, type CampaignSave } from "@/lib/campaign-management";
import { istanbulInputToIso } from "@/lib/local-time";
import { useManagement } from "@/providers/management-provider";

const audiences: Record<CampaignAudience, string> = { all: "Tüm müşteriler", new: "Yeni müşteriler", loyal: "Sadık müşteriler", inactive: "Pasif müşteriler" };
function displayDate(value: string | null) { return value ? new Date(value).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" }) : "Belirtilmemiş"; }

function CampaignForm({ data, busy, onSave, onDirty }: { data: CampaignEditorData; busy: boolean; onSave: (values: CampaignSave) => void; onDirty: (dirty: boolean) => void }) {
  const campaign = data.campaign;
  const [name, setName] = useState(campaign?.name ?? "");
  const [audience, setAudience] = useState<CampaignAudience>(campaign?.audience ?? "all");
  const [code, setCode] = useState(""); const [kind, setKind] = useState<"percentage" | "fixed">("percentage");
  const [value, setValue] = useState(""); const [startsAt, setStartsAt] = useState(""); const [endsAt, setEndsAt] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const change = <T,>(setter: (value: T) => void, key: string, next: T) => { setter(next); onDirty(true); setErrors((previous) => ({ ...previous, [key]: "" })); };
  const submit = () => {
    const next: Record<string, string> = {};
    if (name.trim().length < 2 || name.trim().length > 140) next.name = "Kampanya adı 2–140 karakter olmalı.";
    let start: string | null = null; let end: string | null = null;
    const amount = Number(value);
    if (!campaign) {
      if (!/^[A-Z0-9_-]{3,30}$/.test(code.trim().toUpperCase())) next.code = "Kod 3–30 karakter; yalnızca A–Z, 0–9, alt çizgi veya tire kullan.";
      if (!/^\d+$/.test(value.trim()) || !Number.isInteger(amount) || amount <= 0 || amount > (kind === "percentage" ? 100 : 1_000_000)) next.value = kind === "percentage" ? "Yüzde 1–100 arasında tam sayı olmalı." : "Tutar 1–1.000.000 TL arasında tam sayı olmalı.";
      start = startsAt.trim() ? istanbulInputToIso(startsAt) : null;
      end = endsAt.trim() ? istanbulInputToIso(endsAt) : null;
      if (startsAt.trim() && !start) next.startsAt = "Başlangıcı YIL-AY-GÜN SS:DD biçiminde gir.";
      if (endsAt.trim() && !end) next.endsAt = "Bitişi YIL-AY-GÜN SS:DD biçiminde gir.";
      if (start && end && end <= start) next.endsAt = "Bitiş başlangıçtan sonra olmalı.";
    }
    setErrors(next); if (Object.keys(next).length) return;
    onSave(campaign ? { action: "editMetadata", id: campaign.id, name: name.trim(), audience } : { action: "create", name: name.trim(), audience, code: code.trim().toUpperCase(), kind, value: amount, startsAt: start, endsAt: end });
  };
  if (!campaign && !data.createAllowed) return <View style={styles.card}><Text accessibilityRole="alert" style={styles.error}>Seçili işletmede oluşturma desteklenmiyor. Mevcut kampanya servisi yalnızca ilk yetkili işletmende yeni kampanya oluşturabiliyor; başka işletmeye yanlış kayıt yazılmayacak.</Text></View>;
  return <View style={styles.form}>
    <View style={styles.info}><Text style={styles.note}>Kampanyalar seçili işletmenin tüm şubelerinde ortaktır. Bu işlem otomatik SMS veya e-posta göndermez.</Text></View>
    <FormField label="Kampanya adı" placeholder="Örneğin: Sonbahar fırsatı" value={name} onChangeText={(next) => change(setName, "name", next)} maxLength={140} editable={!busy} error={errors.name} />
    <View style={styles.group}><Text style={styles.label}>Hedef kitle</Text><View style={styles.wrap}>{Object.entries(audiences).map(([key, label]) => <Chip key={key} label={label} selected={audience === key} onPress={() => { if (!busy) change(setAudience, "audience", key as CampaignAudience); }} />)}</View></View>
    {campaign ? <View style={styles.card}>
      <Text style={styles.label}>İndirim koşulları korunuyor</Text><Text style={styles.note}>Bu ekranda yalnızca ad ve hedef kitle güncellenir. Kod, indirim, tarih ve kampanya durumu değiştirilmez.</Text>
      {campaign.discount ? <><Text style={styles.label}>{campaign.discount.code} · {campaign.discount.kind === "percentage" ? `%${campaign.discount.value}` : `${campaign.discount.value.toLocaleString("tr-TR")} TL`}</Text><Text style={styles.note}>Başlangıç: {displayDate(campaign.discount.startsAt)}</Text><Text style={styles.note}>Bitiş: {displayDate(campaign.discount.endsAt)}</Text></> : <Text style={styles.note}>Tekil bir indirim kaydı bulunmuyor. Mevcut indirim kayıtları korunacak.</Text>}
    </View> : <>
      <FormField label="Kampanya kodu" placeholder="SONBAHAR20" value={code} onChangeText={(next) => change(setCode, "code", next)} autoCapitalize="characters" autoCorrect={false} maxLength={30} editable={!busy} error={errors.code} hint="A–Z, rakam, alt çizgi ve tire; işletmende benzersiz olmalı." />
      <View style={styles.group}><Text style={styles.label}>İndirim türü</Text><View style={styles.wrap}><Chip label="Yüzde indirimi" selected={kind === "percentage"} onPress={() => { if (!busy) change(setKind, "value", "percentage"); }} /><Chip label="Sabit TL indirimi" selected={kind === "fixed"} onPress={() => { if (!busy) change(setKind, "value", "fixed"); }} /></View></View>
      <FormField label={kind === "percentage" ? "İndirim yüzdesi" : "İndirim tutarı (TL)"} accessibilityLabel="Kampanya indirim değeri" placeholder={kind === "percentage" ? "20" : "100"} value={value} onChangeText={(next) => change(setValue, "value", next)} maxLength={7} keyboardType="number-pad" editable={!busy} error={errors.value} />
      <View style={styles.card}><Text style={styles.label}>Tarih aralığı · İstanbul saati</Text><Text style={styles.note}>Başlangıç boşsa kampanya hemen aktif olur; ilerideki başlangıçla zamanlanır. Bitiş boşsa indirim için bitiş sınırı kaydedilmez.</Text>
        <FormField label="Kampanya başlangıcı" placeholder="2026-10-15 09:00" hint="İsteğe bağlı · YIL-AY-GÜN SS:DD" value={startsAt} onChangeText={(next) => change(setStartsAt, "startsAt", next)} maxLength={16} autoCapitalize="none" editable={!busy} error={errors.startsAt} />
        <FormField label="Kampanya bitişi" placeholder="2026-10-31 23:59" hint="İsteğe bağlı · YIL-AY-GÜN SS:DD" value={endsAt} onChangeText={(next) => change(setEndsAt, "endsAt", next)} maxLength={16} autoCapitalize="none" editable={!busy} error={errors.endsAt} />
      </View>
    </>}
    <AppButton label={campaign ? "Kampanya bilgilerini kaydet" : "Kampanyayı oluştur"} busy={busy} onPress={submit} />
  </View>;
}

export function CampaignEditor({ campaignId, onClose, onSaved }: { campaignId?: string; onClose: () => void; onSaved?: (id: string) => void }) {
  const { session, user, scope } = useManagement(); const client = useQueryClient(); const insets = useSafeAreaInsets(); const [dirty, setDirty] = useState(false);
  const query = useQuery({ queryKey: ["business-campaign-editor", user?.id, scope, campaignId ?? "new"], queryFn: ({ signal }) => getCampaignEditor(session!.access_token, scope, campaignId, signal), enabled: Boolean(session && scope.businessId), retry: false });
  const mutation = useMutation({ mutationFn: (values: CampaignSave) => saveCampaign(session!.access_token, scope, values), retry: false, onSuccess: async (result) => {
    await Promise.all([client.invalidateQueries({ queryKey: ["business-panel"] }), client.invalidateQueries({ queryKey: ["business-campaign-editor", user?.id] })]);
    onSaved?.(result.id); onClose();
  } });
  const close = () => { if (mutation.isPending) return; if (!dirty) onClose(); else Alert.alert("Değişiklikler kaydedilmedi", "Girdiğin bilgileri bırakıp kampanya ekranını kapatmak istiyor musun?", [{ text: "Devam et", style: "cancel" }, { text: "Değişiklikleri bırak", style: "destructive", onPress: onClose }]); };
  return <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
    <KeyboardAvoidingView style={[styles.screen, { paddingTop: Math.max(16, insets.top) }]} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.header}><Megaphone size={22} color={theme.colors.primary} /><View style={{ flex: 1 }}><Text style={styles.heading}>{campaignId ? "Kampanya bilgileri" : "Yeni kampanya"}</Text><Text style={styles.note}>İşletme pazarlama paneli</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Kampanya ekranını kapat" disabled={mutation.isPending} onPress={close} style={styles.close}><X size={23} color={theme.colors.text} /></Pressable></View>
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: 32 + insets.bottom }]} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        {query.isPending ? <LoadingState label="Kampanya bilgileri yükleniyor..." /> : null}
        {query.isError ? <><Text accessibilityRole="alert" style={styles.error}>{query.error.message}</Text><AppButton label="Kampanyayı yeniden yükle" onPress={() => void query.refetch()} /></> : null}
        {mutation.error ? <Text accessibilityRole="alert" style={styles.error}>{mutation.error.message}</Text> : null}
        {query.data ? <CampaignForm data={query.data} busy={mutation.isPending} onSave={(values) => mutation.mutate(values)} onDirty={setDirty} /> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  </Modal>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F8F8FA" }, header: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 20, paddingVertical: 14, backgroundColor: theme.colors.surface },
  close: { minHeight: 44, minWidth: 44, alignItems: "center", justifyContent: "center" }, heading: { color: theme.colors.text, fontSize: 19, fontWeight: theme.typography.weight.semibold },
  body: { padding: 20, gap: 16 }, form: { gap: 20 }, group: { gap: 10 }, wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  label: { color: theme.colors.text, fontSize: 14, lineHeight: 21, fontWeight: theme.typography.weight.medium }, note: { color: theme.colors.muted, fontSize: 13, lineHeight: 21 },
  card: { padding: 16, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 16, backgroundColor: theme.colors.surface, gap: 12 }, info: { padding: 14, borderRadius: 12, backgroundColor: theme.colors.primarySoft },
  error: { color: theme.colors.danger, fontSize: 14, lineHeight: 21 },
});
