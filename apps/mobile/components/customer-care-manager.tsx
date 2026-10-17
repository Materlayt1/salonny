import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { AppButton, Chip, EmptyState, LoadingState } from "@/components/app-ui";
import { FormField } from "@/components/form-field";
import { theme } from "@/constants/theme";
import { getCustomerCare, saveCustomerCare, type CustomerCare, type CustomerCareTab, type CustomerCareWrite } from "@/lib/customer-care";
import { formatReportMoney } from "@/lib/business-report";
import { useManagement } from "@/providers/management-provider";
import { customerCareProfileInput } from "../../../lib/customer-care-contract";

const consentLabels = { missing: "Eksik", requested: "Talep edildi", signed: "İmzalandı olarak kaydedildi", revoked: "Geri çekildi" };
const statusLabels: Record<string, string> = { pending: "Bekliyor", confirmed: "Onaylandı", completed: "Tamamlandı", cancelled: "İptal", no_show: "Gelmedi", queued: "Kuyrukta", processing: "İşleniyor", delivered: "Teslim edildi", retry: "Yeniden denenecek", dead_letter: "Teslim edilemedi" };
const tabs: { key: CustomerCareTab; label: string }[] = [{ key: "appointments", label: "Randevu geçmişi" }, { key: "loyalty", label: "Sadakat hareketleri" }, { key: "communications", label: "İletişim durumu" }, { key: "media", label: "Bakım görselleri" }];
const date = (value: string) => new Date(value).toLocaleString("tr-TR");

function CareForm({ care, onClose }: { care: CustomerCare; onClose: () => void }) {
  const { session, scope, user } = useManagement(); const client = useQueryClient();
  const [allergies, setAllergies] = useState(care.profile.allergies.join(", ")); const [anamnesis, setAnamnesis] = useState(care.profile.anamnesis ?? "");
  const [notes, setNotes] = useState(care.profile.treatmentNotes ?? ""); const [consent, setConsent] = useState(care.profile.consentStatus); const [version, setVersion] = useState(care.profile.consentVersion ?? "");
  const [error, setError] = useState(""); const [stale, setStale] = useState(false); const [discard, setDiscard] = useState(false);
  const dirty = allergies !== care.profile.allergies.join(", ") || anamnesis !== (care.profile.anamnesis ?? "") || notes !== (care.profile.treatmentNotes ?? "") || consent !== care.profile.consentStatus || version !== (care.profile.consentVersion ?? "");
  const mutation = useMutation({ mutationFn: (input: CustomerCareWrite) => saveCustomerCare(session!.access_token, scope, input), onSuccess: async () => {
    await client.invalidateQueries({ queryKey: ["customer-care", user?.id, session?.access_token, scope.businessId, scope.branchId, care.customer.id] }); onClose();
  }, onError: (failure: Error & { status?: number }) => { setError(failure.message); if (failure.status === 409) setStale(true); } });
  const save = () => {
    const items = allergies.split(",").map((item) => item.trim()).filter(Boolean);
    if (items.length > 50 || items.some((item) => item.length > 120)) { setError("En fazla 50 alerji, her biri en fazla 120 karakter olabilir."); return; }
    const checked = customerCareProfileInput.safeParse({ customerId: care.customer.id, expectedVersion: care.profile.updatedAt, allergies: items, anamnesis: anamnesis.trim(), treatmentNotes: notes.trim(), consentStatus: consent, consentVersion: version.trim() });
    if (!checked.success) { setError("Bakım alanlarının uzunluklarını kontrol et."); return; }
    setError(""); mutation.mutate(checked.data);
  };
  return <View style={styles.card} testID="customer-care-form"><Text style={styles.heading}>Bakım kaydını düzenle</Text>
    <FormField label="Alerjiler (virgülle)" value={allergies} onChangeText={setAllergies} maxLength={6048} editable={!mutation.isPending && !stale} />
    <FormField label="Anamnez" value={anamnesis} onChangeText={setAnamnesis} maxLength={5000} multiline editable={!mutation.isPending && !stale} />
    <FormField label="İşlem notları" value={notes} onChangeText={setNotes} maxLength={5000} multiline editable={!mutation.isPending && !stale} />
    <Text style={styles.label}>Onam durum kaydı</Text><View style={styles.wrap}>{(Object.keys(consentLabels) as Array<keyof typeof consentLabels>).map((key) => <Chip key={key} label={consentLabels[key]} selected={key === consent} onPress={() => { if (!mutation.isPending && !stale) setConsent(key); }} />)}</View>
    <FormField label="Onam sürümü" value={version} onChangeText={setVersion} maxLength={80} editable={!mutation.isPending && !stale} />
    <Text style={styles.note}>Bu seçim yalnız işletmenin tuttuğu durum kaydıdır; hukuki onam, elektronik imza veya kimlik doğrulaması oluşturmaz. Pazarlama iznini değiştirmez.</Text>
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    {stale ? <AppButton label="Güncel bakım kaydını yükle" variant="secondary" onPress={() => { void client.invalidateQueries({ queryKey: ["customer-care"] }); onClose(); }} /> : <AppButton label="Bakım kaydını kaydet" busy={mutation.isPending} onPress={save} />}
    <AppButton label="Bakım düzenlemesini kapat" variant="ghost" disabled={mutation.isPending} onPress={() => dirty ? setDiscard(true) : onClose()} />
    {discard ? <View style={styles.row}><Text style={styles.note}>Kaydedilmemiş bakım değişikliklerin var.</Text><AppButton label="Düzenlemeye devam et" variant="secondary" onPress={() => setDiscard(false)} /><AppButton label="Değişiklikleri bırak" variant="danger" onPress={onClose} /></View> : null}
  </View>;
}

function CareContent({ customerId, onBack }: { customerId: string; onBack: () => void }) {
  const { session, user, scope, context } = useManagement(); const [tab, setTab] = useState<CustomerCareTab>("appointments"); const [offset, setOffset] = useState(0); const [editingCare, setEditingCare] = useState<CustomerCare | null>(null);
  const editing = editingCare !== null;
  const query = useQuery({ queryKey: ["customer-care", user?.id, session?.access_token, scope.businessId, scope.branchId, customerId, tab, offset], queryFn: ({ signal }) => getCustomerCare(session!.access_token, scope, customerId, tab, offset, signal), retry: false, staleTime: 0, gcTime: 0, enabled: !editing, refetchOnWindowFocus: !editing, refetchOnReconnect: !editing });
  // The base revision belongs to the draft opened by the user. A cache refresh
  // can never pair an old draft with a newer expectedVersion.
  const care = editingCare ?? query.data; const loading = !editing && (query.isPending || query.isFetching);
  const visible = !loading && !query.error && care && care.scope.financialVisible === context.data?.financialVisibility && care.scope.canWrite === ["OWNER", "MANAGER"].includes(context.data!.role) && (context.data!.role === "EMPLOYEE") === (care.scope.employeeId !== null);
  return <ScrollView contentContainerStyle={styles.content} testID="customer-care-content">
    {!editing ? <AppButton label="Müşteri listesine dön" variant="ghost" onPress={onBack} /> : null}
    {loading ? <LoadingState label="Müşteri bakım kaydı yükleniyor..." /> : null}
    {query.error || (!loading && care && !visible) ? <EmptyState title="Müşteri kaydı alınamadı" detail={query.error?.message ?? "Kayıt yetkisi doğrulanamadı."} action={<AppButton label="Müşteri kaydını yeniden yükle" onPress={() => void query.refetch()} />} /> : null}
    {visible && care ? <>
      <View style={styles.card}><Text style={styles.heading}>{care.customer.fullName}</Text><Text style={styles.label}>{care.customer.phone}</Text>{care.customer.email ? <Text style={styles.note}>{care.customer.email}</Text> : null}
        {care.customer.notes ? <Text style={styles.note}>İşletme notu: {care.customer.notes}</Text> : null}<Text style={styles.note}>Pazarlama izni: {care.customer.marketingConsent ? "Kayıtlı" : "Kayıtlı değil"}</Text>
        <Text style={styles.note}>{care.scope.employeeId ? "Müşteri görünürlüğü yetki kapsamınla sınırlıdır. Randevu ve iletişim geçmişinde yalnız sana atanmış kayıtlar gösterilir." : "İşletmenin müşteri bakım kartı."}</Text></View>
      {editing ? <CareForm key={care.profile.updatedAt ?? "new"} care={care} onClose={() => setEditingCare(null)} /> : <View style={styles.card} testID="customer-care-profile"><Text style={styles.subheading}>Bakım ve onam kaydı</Text>
        <Text style={styles.label}>Alerjiler</Text><Text style={styles.note}>{care.profile.allergies.join(", ") || "Kayıt yok"}</Text><Text style={styles.label}>Anamnez</Text><Text style={styles.note}>{care.profile.anamnesis || "Kayıt yok"}</Text><Text style={styles.label}>İşlem notları</Text><Text style={styles.note}>{care.profile.treatmentNotes || "Kayıt yok"}</Text>
        <Text style={styles.label}>Onam: {consentLabels[care.profile.consentStatus]}</Text><Text style={styles.note}>Sürüm: {care.profile.consentVersion || "Kayıt yok"}{care.profile.consentAt ? ` · ${date(care.profile.consentAt)}` : ""}</Text>
        <Text style={styles.note}>Durum kaydıdır; bu ekran elektronik imza veya hukuki onam oluşturmaz.</Text><Text style={styles.note}>Son güncelleme: {care.profile.updatedAt ? date(care.profile.updatedAt) : "Henüz bakım kaydı oluşturulmamış"}</Text>
        {care.scope.canWrite ? <AppButton label="Bakım kaydını düzenle" variant="secondary" onPress={() => setEditingCare(care)} /> : <Text style={styles.note}>Salt okunur · düzenleme için sahip/yönetici yetkisi gerekir.</Text>}
      </View>}
      {care.loyalty ? <View style={styles.card}><Text style={styles.subheading}>Sadakat bakiyesi</Text><Text style={styles.balance}>{care.loyalty.points.toLocaleString("tr-TR")} puan · {care.loyalty.tier}</Text><Text style={styles.note}>Gözlenen güncel bakiye. Eski hareketlerin tamamı saklanmamış; geçmiş kazanım/kullanım tahmin edilmez.</Text><Text style={styles.note}>{care.loyalty.recordedSince ? `İzlenebilir hareketler: ${date(care.loyalty.recordedSince)} itibarıyla` : "Henüz yeni sistemde izlenebilir puan hareketi yok."}</Text></View> : <View style={styles.card}><Text style={styles.note}>{care.scope.financialVisible ? "Henüz sadakat hesabı yok." : "Finansal görünürlük kapalı; randevu tutarları ve sadakat hareketleri gösterilmez."}</Text></View>}
      {!editing ? <><View style={styles.wrap}>{tabs.filter((item) => item.key !== "loyalty" || care.scope.financialVisible).map((item) => <Chip key={item.key} label={item.label} selected={tab === item.key} onPress={() => { setTab(item.key); setOffset(0); }} />)}</View>
      <View style={styles.card}><Text style={styles.subheading}>{tabs.find((item) => item.key === tab)?.label} · {care.page.total.toLocaleString("tr-TR")}</Text>
        <Text style={styles.note}>{tab === "appointments" || tab === "communications" ? "Seçili şube geçmişi; her sayfada 25 kayıt." : "İşletme genelindeki müşteri kayıtları; her sayfada 25 kayıt."} Tarih ve saatler cihazının saat dilimindedir.</Text>
        {tab === "communications" ? <Text style={styles.note}>Yalnız teslimat durumu ve deneme sayısı gösterilir. Mesaj içeriği, alıcı adresi veya sağlayıcı çıktısı gösterilmez; buradan mesaj gönderilmez.</Text> : null}
        {tab === "media" ? <Text style={styles.note}>Mevcut özel görsellerin bağlantıları 5 dakika geçerlidir. Yeni görsel yüklenmez; erişim yenilemede yeniden doğrulanır.</Text> : null}
        {!care.page.rows.length ? <Text style={styles.note}>Bu kapsamda kayıt yok.</Text> : null}
        {care.page.rows.map((row) => <View key={row.id} style={styles.row} testID={`customer-care-row-${row.id}`}>
          {row.type === "appointment" ? <><Text style={styles.label}>{row.services.join(", ") || "Hizmet"}</Text><Text style={styles.note}>{date(row.startsAt)} · {row.employeeName} · {row.branchName}</Text><Text style={styles.label}>{statusLabels[row.status] ?? row.status}</Text>{row.amountMinor !== null && row.currency ? <Text style={styles.note}>{formatReportMoney(row.amountMinor, row.currency)} · kayıtlı randevu tutarı; tahsilat değildir.</Text> : null}</> : null}
          {row.type === "loyalty" ? <><Text style={styles.label}>{row.kind === "observed_baseline" ? "Eski bakiye gözlendi; geçmiş hareket değildir" : row.kind === "account_opened" ? "Yeni sadakat hesabı açıldı" : "Puan bakiyesi değişti"}</Text><Text style={styles.note}>{date(row.occurredAt)}</Text><Text style={styles.label}>{row.delta > 0 ? "+" : ""}{row.delta} puan · {row.balanceBefore} → {row.balanceAfter}</Text></> : null}
          {row.type === "communication" ? <><Text style={styles.label}>{row.channel.toLocaleUpperCase("tr-TR")} · {statusLabels[row.status] ?? row.status}</Text><Text style={styles.note}>{date(row.createdAt)} · {row.attempts} deneme</Text>{row.deliveredAt ? <Text style={styles.note}>Teslimat: {date(row.deliveredAt)}</Text> : null}</> : null}
          {row.type === "media" ? <><Text style={styles.label}>{row.kind === "before" ? "İşlem öncesi" : row.kind === "after" ? "İşlem sonrası" : "Bakım belgesi"}</Text>{row.url ? <Image source={{ uri: row.url }} alt={row.caption || "Özel bakım görseli"} accessibilityLabel={row.caption || "Özel bakım görseli"} style={styles.image} resizeMode="contain" /> : <Text style={styles.note}>Görsel bağlantısı yüklenemedi.</Text>}{row.caption ? <Text style={styles.note}>{row.caption}</Text> : null}<Text style={styles.note}>{date(row.createdAt)}</Text></> : null}
        </View>)}
        <View style={styles.wrap}>{offset > 0 ? <AppButton label="Önceki müşteri kayıtları" variant="secondary" onPress={() => setOffset((value) => Math.max(0, value - 25))} /> : null}{care.page.hasMore ? <AppButton label="Sonraki müşteri kayıtları" variant="secondary" onPress={() => setOffset((value) => value + 25)} /> : null}</View>
        <AppButton label="Müşteri geçmişini yenile" variant="ghost" onPress={() => void query.refetch()} />
      </View></> : null}
    </> : null}
  </ScrollView>;
}

/** Never retain a private customer's query/form across changing identity or scope. */
export function CustomerCareManager({ customerId, onBack }: { customerId: string; onBack: () => void }) {
  const { context, session, scope, user } = useManagement();
  if (context.isPlaceholderData || context.isPending) return <LoadingState label="Müşteri erişimi doğrulanıyor..." />;
  if (context.error || !session?.access_token || !context.data?.permissions.customers || context.data.customerVisibility === "none" || !scope.businessId || !scope.branchId) return <EmptyState title="Müşteri yetkisi gerekli" detail="Bu müşteri bölümüne erişimin yok." action={<AppButton label="Müşteri listesine dön" onPress={onBack} />} />;
  // Hide the private subtree while revalidating the same identity/scope, but
  // keep its draft mounted. A changed identity/scope or denied result still
  // destroys the subtree immediately through the key / checks above.
  return <View style={{ flex: 1 }}><View style={{ flex: 1, display: context.isFetching ? "none" : "flex" }}><CareContent key={`${user?.id}:${session.access_token}:${scope.businessId}:${scope.branchId}:${customerId}`} customerId={customerId} onBack={onBack} /></View>{context.isFetching ? <LoadingState label="Müşteri erişimi doğrulanıyor..." /> : null}</View>;
}
const styles = StyleSheet.create({ content: { padding: 16, paddingBottom: 40, gap: 16 }, card: { padding: 16, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, gap: 10 }, heading: { fontSize: 23, lineHeight: 31, color: theme.colors.text, fontWeight: theme.typography.weight.semibold }, subheading: { fontSize: 17, lineHeight: 25, color: theme.colors.text, fontWeight: theme.typography.weight.medium }, label: { fontSize: 14, lineHeight: 22, color: theme.colors.text, fontWeight: theme.typography.weight.medium }, note: { fontSize: 13, lineHeight: 21, color: theme.colors.muted }, wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, row: { borderTopWidth: 1, borderTopColor: theme.colors.border, paddingVertical: 12, gap: 7 }, balance: { fontSize: 21, lineHeight: 29, color: theme.colors.primaryDark, fontWeight: theme.typography.weight.medium }, error: { fontSize: 13, lineHeight: 21, color: theme.colors.danger }, image: { width: "100%", height: 240, borderRadius: 12, backgroundColor: theme.colors.background } });
