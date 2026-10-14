import { useRef, useState } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { randomUUID } from "expo-crypto";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Megaphone, X } from "lucide-react-native";
import { AppButton, Chip, EmptyState, LoadingState } from "@/components/app-ui";
import { FormField } from "@/components/form-field";
import { theme } from "@/constants/theme";
import { Alert } from "@/lib/alert";
import { displayCampaignAmount, getCampaigns, parseCampaignAmount, saveCampaign, type CampaignAudience, type CampaignMutation, type ManagedCampaign } from "@/lib/campaign-management";
import { istanbulInputToIso } from "@/lib/local-time";
import { useManagement } from "@/providers/management-provider";

const audiences: Record<CampaignAudience, string> = { all: "Tüm müşteriler", new: "Yeni müşteriler", loyal: "Sadık müşteriler", inactive: "Pasif müşteriler" };
const statuses: Record<string, string> = { draft: "Taslak / duraklatıldı", active: "Aktif", scheduled: "Planlandı", completed: "Tamamlandı", cancelled: "İptal" };
function localDate(value: string | null | undefined) { return value ? new Date(Date.parse(value) + 3 * 3_600_000).toISOString().slice(0, 16).replace("T", " ") : ""; }
function termsLabel(row: ManagedCampaign) { return row.terms ? `${row.terms.code} · ${row.terms.kind === "percentage" ? `%${row.terms.value}` : `${displayCampaignAmount(row.terms.value)} sabit tutar`}` : "Eski kupon bağlantısı · inceleme gerekli"; }

export function CampaignEditor({ campaign, onClose, onSaved }: { campaign?: ManagedCampaign; onClose: () => void; onSaved?: (id: string) => void }) {
  const { session, user, scope, context } = useManagement(); const client = useQueryClient(); const insets = useSafeAreaInsets();
  const [dirty, setDirty] = useState(false); const [name, setName] = useState(campaign?.name ?? "");
  const [status, setStatus] = useState<"draft" | "active" | "cancelled">(campaign?.status === "draft" ? "draft" : campaign?.status === "cancelled" ? "cancelled" : "active");
  const [audience, setAudience] = useState<CampaignAudience>(campaign?.terms?.audience ?? "all");
  const [code, setCode] = useState(campaign?.terms?.code ?? ""); const [kind, setKind] = useState<"percentage" | "fixed">(campaign?.terms?.kind ?? "percentage");
  const [value, setValue] = useState(campaign?.terms ? campaign.terms.kind === "percentage" ? String(campaign.terms.value) : displayCampaignAmount(campaign.terms.value) : "");
  const [startsAt, setStartsAt] = useState(localDate(campaign?.terms?.startsAt)); const [endsAt, setEndsAt] = useState(localDate(campaign?.terms?.endsAt));
  const [errors, setErrors] = useState<Record<string, string>>({}); const request = useRef<{ fingerprint: string; id: string } | null>(null);
  const editable = !campaign || campaign.termsEditable;
  const mutation = useMutation({ mutationFn: (values: CampaignMutation) => saveCampaign(session!.access_token, scope, values), retry: false, onSuccess: async (result) => {
    await Promise.all([client.invalidateQueries({ queryKey: ["business-panel"] }), client.invalidateQueries({ queryKey: ["business-campaigns", user?.id] })]); onSaved?.(result.id); onClose();
  } });
  const change = <T,>(setter: (value: T) => void, key: string, next: T) => { if (mutation.isPending) return; setter(next); setDirty(true); setErrors((previous) => ({ ...previous, [key]: "" })); };
  const submit = () => {
    const next: Record<string, string> = {};
    if (name.trim().length < 2 || name.trim().length > 140) next.name = "Kampanya adı 2–140 karakter olmalı.";
    const amount = kind === "fixed" ? parseCampaignAmount(value) : /^[0-9]+$/.test(value.trim()) && Number(value) >= 1 && Number(value) <= 100 ? Number(value) : null;
    const start = startsAt.trim() ? istanbulInputToIso(startsAt) : null; const end = endsAt.trim() ? istanbulInputToIso(endsAt) : null;
    if (editable) {
      if (!/^[A-Z0-9_-]{3,30}$/.test(code.trim().toUpperCase())) next.code = "Kod 3–30 karakter; yalnızca A–Z, 0–9, alt çizgi veya tire kullan.";
      if (amount === null) next.value = kind === "percentage" ? "Yüzde 1–100 arasında tam sayı olmalı." : "Tutar 0,01–1.000.000 arasında, en fazla iki ondalık olmalı.";
      if (startsAt.trim() && !start) next.startsAt = "Başlangıcı YIL-AY-GÜN SS:DD biçiminde gir.";
      if (endsAt.trim() && !end) next.endsAt = "Bitişi YIL-AY-GÜN SS:DD biçiminde gir.";
      if (start && end && end <= start) next.endsAt = "Bitiş başlangıçtan sonra olmalı.";
    }
    setErrors(next); if (Object.keys(next).length) return;
    const common = { name: name.trim(), status, id: campaign?.id ?? null, revision: campaign?.revision ?? null };
    const values = editable ? { ...common, action: "save" as const, terms: { code: code.trim().toUpperCase(), kind, value: amount!, audience, startsAt: start, endsAt: end } } : { ...common, id: campaign!.id, revision: campaign!.revision, action: "metadata" as const };
    const fingerprint = JSON.stringify(values); if (request.current?.fingerprint !== fingerprint) request.current = { fingerprint, id: randomUUID() };
    mutation.mutate({ ...values, requestId: request.current!.id });
  };
  const close = () => { if (mutation.isPending) return; if (!dirty) onClose(); else Alert.alert("Değişiklikler kaydedilmedi", "Girdiğin bilgileri bırakıp kampanya ekranını kapatmak istiyor musun?", [{ text: "Devam et", style: "cancel" }, { text: "Değişiklikleri bırak", style: "destructive", onPress: onClose }]); };
  if (context.isPending || context.isPlaceholderData || context.isError || !session || context.data?.role === "EMPLOYEE" || !context.data?.permissions.campaigns || (campaign && campaign.businessId !== scope.businessId)) return null;
  return <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={close}><KeyboardAvoidingView style={[styles.screen, { paddingTop: Math.max(16, insets.top) }]} behavior={Platform.OS === "ios" ? "padding" : undefined}>
    <View style={styles.header}><Megaphone size={22} color={theme.colors.primary} /><View style={{ flex: 1 }}><Text style={styles.heading}>{campaign ? "Kampanya düzenle" : "Yeni kampanya"}</Text><Text style={styles.note}>{context.data?.business.name} · tüm şubeler</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Kampanya ekranını kapat" disabled={mutation.isPending} onPress={close} style={styles.close}><X size={23} color={theme.colors.text} /></Pressable></View>
    <ScrollView contentContainerStyle={[styles.body, { paddingBottom: 32 + insets.bottom }]} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
      <View style={styles.info}><Text style={styles.note}>Kampanya seçili işletmenin tüm şubelerinde ortaktır. Otomatik SMS/e-posta göndermez. Aynı kod her müşteriye yalnız bir kez uygulanır; iptal kullanım hakkını yenilemez.</Text></View>
      {mutation.error ? <><Text accessibilityRole="alert" style={styles.error}>{mutation.error.message}</Text><Text style={styles.note}>Bağlantı hatasında aynı bilgilerle tekrar kaydetmek aynı işlem anahtarını kullanır; çift kayıt oluşturmaz. Sürüm çakışmasında ekranı kapatıp listeyi yenile.</Text></> : null}
      <FormField label="Kampanya adı" placeholder="Örneğin: Sonbahar fırsatı" value={name} onChangeText={(next) => change(setName, "name", next)} maxLength={140} editable={!mutation.isPending} error={errors.name} />
      <View style={styles.group}><Text style={styles.label}>Durum</Text><View style={styles.wrap}>{(["active", "draft", "cancelled"] as const).map((item) => <Chip key={item} label={statuses[item]} selected={status === item} onPress={() => change(setStatus, "status", item)} />)}</View></View>
      {!editable ? <View style={styles.card}><Text style={styles.label}>İndirim koşulları korunuyor</Text><Text style={styles.note}>{campaign?.lockReason === "used" ? "Bu kupon kullanılmış. Kod, indirim, tarih ve hedef kitle değiştirilemez. Ad ve durum güncellenebilir." : "Eski kampanyanın tekil/geçerli kupon bağlantısı yok. Ad ve durum güncellenebilir; kupon koşulları incelenmeden değiştirilemez."}</Text><Text style={styles.label}>{termsLabel(campaign!)}</Text>{campaign?.terms ? <Text style={styles.note}>{audiences[campaign.terms.audience]} · Başlangıç: {localDate(campaign.terms.startsAt) || "Sınırsız"} · Bitiş: {localDate(campaign.terms.endsAt) || "Sınırsız"} (İstanbul)</Text> : null}</View> : <>
        <FormField label="Kampanya kodu" placeholder="SONBAHAR20" value={code} onChangeText={(next) => change(setCode, "code", next)} autoCapitalize="characters" autoCorrect={false} maxLength={30} editable={!mutation.isPending} error={errors.code} hint="İşletmende benzersiz; kullanılmış kod yeniden verilemez." />
        <View style={styles.group}><Text style={styles.label}>İndirim türü</Text><View style={styles.wrap}><Chip label="Yüzde indirimi" selected={kind === "percentage"} onPress={() => change(setKind, "value", "percentage")} /><Chip label="Sabit tutar indirimi" selected={kind === "fixed"} onPress={() => change(setKind, "value", "fixed")} /></View></View>
        <FormField label={kind === "percentage" ? "İndirim yüzdesi" : "İndirim tutarı"} accessibilityLabel="Kampanya indirim değeri" placeholder={kind === "percentage" ? "20" : "100,50"} value={value} onChangeText={(next) => change(setValue, "value", next)} maxLength={10} keyboardType="decimal-pad" editable={!mutation.isPending} error={errors.value} />
        {kind === "fixed" ? <Text style={styles.note}>Sabit tutar seçilen hizmetin para biriminde uygulanır. Örneğin 10,50; TRY hizmette 10,50 TRY, EUR hizmette 10,50 EUR indirimdir. Kur dönüşümü yapılmaz. İndirim hizmet tutarını aşamaz.</Text> : null}
        <View style={styles.group}><Text style={styles.label}>Hedef kitle</Text><View style={styles.wrap}>{Object.entries(audiences).map(([key, label]) => <Chip key={key} label={label} selected={audience === key} onPress={() => change(setAudience, "audience", key as CampaignAudience)} />)}</View><Text style={styles.note}>Yeni: hiç tamamlanan randevusu yok. Sadık: en az 5 tamamlanan randevu. Pasif: son tamamlanan randevu en az 90 gün önce. Uygunluk randevu onayında tekrar kontrol edilir.</Text></View>
        <View style={styles.card}><Text style={styles.label}>Tarih aralığı · İstanbul saati</Text><Text style={styles.note}>İleri başlangıç aktif durumunu planlandı yapar. Boş tarihler sınır koymaz. Bitiş anından itibaren kod geçersizdir.</Text><FormField label="Kampanya başlangıcı" placeholder="2026-10-15 09:00" hint="İsteğe bağlı · YIL-AY-GÜN SS:DD" value={startsAt} onChangeText={(next) => change(setStartsAt, "startsAt", next)} maxLength={16} autoCapitalize="none" editable={!mutation.isPending} error={errors.startsAt} /><FormField label="Kampanya bitişi" placeholder="2026-10-31 23:59" hint="İsteğe bağlı · YIL-AY-GÜN SS:DD" value={endsAt} onChangeText={(next) => change(setEndsAt, "endsAt", next)} maxLength={16} autoCapitalize="none" editable={!mutation.isPending} error={errors.endsAt} /></View>
      </>}
      <AppButton label={campaign ? "Kampanya bilgilerini kaydet" : "Kampanyayı oluştur"} busy={mutation.isPending} onPress={submit} />
    </ScrollView>
  </KeyboardAvoidingView></Modal>;
}
function CampaignsContent() {
  const { user, session, scope, context } = useManagement(); const [draftQ, setDraftQ] = useState(""); const [q, setQ] = useState(""); const [editor, setEditor] = useState<ManagedCampaign | "new" | null>(null);
  const query = useInfiniteQuery({ queryKey: ["business-campaigns", user?.id, session!.access_token, scope.businessId, scope.branchId, q], initialPageParam: 0, queryFn: ({ pageParam, signal }) => getCampaigns(session!.access_token, scope, q, pageParam, signal), getNextPageParam: (last) => last.hasMore ? last.offset + 25 : undefined, retry: false });
  const rows = query.data?.pages.flatMap((page) => page.rows) ?? []; const total = query.data?.pages[0]?.total; const coherent = query.data?.pages.every((page) => page.total === total) && new Set(rows.map((row) => row.id)).size === rows.length;
  return <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled"><Text style={styles.heading}>Kampanyalar</Text><Text style={styles.note}>{context.data?.business.name} · kampanyalar tüm şubelerde ortaktır.</Text><AppButton label="Yeni kampanya" onPress={() => setEditor("new")} /><FormField label="Kampanya ara" value={draftQ} maxLength={120} onChangeText={setDraftQ} placeholder="Kampanya adı" onSubmitEditing={() => setQ(draftQ.trim())} /><View style={styles.wrap}><AppButton label="Kampanyalarda ara" variant="secondary" onPress={() => setQ(draftQ.trim())} /><AppButton label="Kampanya listesini yenile" variant="ghost" busy={query.isRefetching && !query.isFetchingNextPage} onPress={() => void query.refetch()} /></View>
    {query.isPending || (query.isRefetching && !query.isFetchingNextPage) ? <LoadingState label="Kampanyalar yükleniyor..." /> : query.error ? <EmptyState title="Kampanyalar alınamadı" detail={query.error.message} action={<AppButton label="Kampanyaları yeniden yükle" onPress={() => void query.refetch()} />} /> : !coherent ? <EmptyState title="Kampanya listesi değişti" detail="Tutarlı liste için yeniden yükle." action={<AppButton label="Değişen listeyi yenile" onPress={() => void query.refetch()} />} /> : <><Text style={styles.note}>{total?.toLocaleString("tr-TR")} kampanya · {rows.length} gösteriliyor</Text>{!rows.length ? <EmptyState title="Kampanya bulunamadı" detail={q ? "Aramanı değiştirebilir veya yeni bir kampanya oluşturabilirsin." : "İlk teklifini oluştur; müşterin randevuda kodu girerek kullanabilir."} /> : null}{rows.map((row) => <View key={row.id} style={styles.card}><Text style={styles.label}>{row.name}</Text><Text style={styles.note}>{statuses[row.status]} · {termsLabel(row)}</Text>{row.terms ? <Text style={styles.note}>{audiences[row.terms.audience]} · bitiş: {localDate(row.terms.endsAt) || "Sınırsız"} (İstanbul)</Text> : null}{row.lockReason ? <Text style={styles.note}>{row.lockReason === "used" ? "Kupon kullanılmış; indirim koşulları kilitli." : "Eski kupon bağlantısı incelenmeli."}</Text> : null}<AppButton label="Kampanya düzenle" accessibilityLabel={`${row.name} kampanyasını düzenle`} variant="secondary" onPress={() => setEditor(row)} /></View>)}{query.hasNextPage ? <AppButton label="Daha fazla kampanya" variant="ghost" busy={query.isFetchingNextPage} onPress={() => void query.fetchNextPage()} /> : null}</>}
    {editor ? <CampaignEditor key={`${scope.businessId}-${scope.branchId}-${editor === "new" ? "new" : editor.id}`} campaign={editor === "new" ? undefined : editor} onClose={() => setEditor(null)} /> : null}
  </ScrollView>;
}
export function BusinessCampaignsPanel() {
  const { context, user, session, scope } = useManagement();
  if (context.isPlaceholderData || context.isPending) return <LoadingState label="Seçili işletme yükleniyor..." />;
  if (context.isError || !session || !scope.businessId || !scope.branchId || !context.data || !["OWNER", "MANAGER"].includes(context.data.role) || !context.data.permissions.campaigns) return <EmptyState title="Kampanya yönetim yetkisi gerekli" detail="Kampanyaları yalnız işletme sahibi veya yönetici düzenleyebilir." />;
  return <CampaignsContent key={`${user?.id}-${session.access_token}-${scope.businessId}-${scope.branchId}`} />;
}
const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: "#F8F8FA" }, header: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 20, paddingVertical: 14, backgroundColor: theme.colors.surface }, close: { minHeight: 44, minWidth: 44, alignItems: "center", justifyContent: "center" }, heading: { color: theme.colors.text, fontSize: 22, lineHeight: 30, fontWeight: theme.typography.weight.semibold }, body: { padding: 20, paddingBottom: 40, gap: 16 }, group: { gap: 10 }, wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, label: { color: theme.colors.text, fontSize: 14, lineHeight: 21, fontWeight: theme.typography.weight.medium }, note: { color: theme.colors.muted, fontSize: 13, lineHeight: 21 }, card: { padding: 16, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 16, backgroundColor: theme.colors.surface, gap: 12 }, info: { padding: 14, borderRadius: 12, backgroundColor: theme.colors.primarySoft }, error: { color: theme.colors.danger, fontSize: 14, lineHeight: 21 } });
