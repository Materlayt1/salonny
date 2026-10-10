import { useEffect, useState } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { CalendarDays, Scissors, Users, Plus, X, Search, ChevronLeft, ChevronRight, Package, CheckCircle2, type LucideIcon } from "lucide-react-native";
import { AppButton, Chip, EmptyState, LoadingState } from "@/components/app-ui";
import { useManagement } from "@/providers/management-provider";
import { panelSections, getPanelPage, savePanelRecord, canViewSection, type PanelRow, type PanelSection, type PanelSettings } from "@/lib/management";
import { theme } from "@/constants/theme";
import { Alert } from "@/lib/alert";
import { TeamManager } from "@/components/team-manager";
import { BusinessProfileEditor } from "@/components/business-profile-editor";
import { CampaignEditor } from "@/components/campaign-editor";
import { BusinessBookingEditor } from "@/components/business-booking-editor";
import { PackageManager } from "@/components/package-manager";

const statuses: Record<string, string> = { pending: "Onay bekliyor", confirmed: "Onaylandı", completed: "Tamamlandı", cancelled: "İptal edildi", no_show: "Gelmedi", draft: "Taslak", active: "Aktif", waiting: "Bekliyor", offered: "Teklif gönderildi" };
const metricIcons: Record<string, LucideIcon> = { calendar: CalendarDays, scissors: Scissors, users: Users, customer: Users };
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
const money = (minor: number) => `${(minor / 100).toLocaleString("tr-TR")} ₺`;
const editable: PanelSection[] = ["customers", "services", "employees", "inventory"];
type FormField = { key: string; label: string; numeric?: boolean; multiline?: boolean };
const fields: Partial<Record<PanelSection, FormField[]>> = {
  customers: [{ key: "fullName", label: "Ad soyad" }, { key: "phone", label: "Telefon" }, { key: "email", label: "E-posta" }, { key: "notes", label: "Müşteri notu", multiline: true }],
  services: [{ key: "name", label: "Hizmet adı" }, { key: "description", label: "Açıklama", multiline: true }, { key: "durationMinutes", label: "Süre (dakika)", numeric: true }, { key: "price", label: "Fiyat (TL)", numeric: true }],
  employees: [{ key: "displayName", label: "Ad soyad" }, { key: "title", label: "Unvan" }, { key: "bio", label: "Hakkında", multiline: true }],
  inventory: [{ key: "name", label: "Ürün adı" }, { key: "sku", label: "Stok kodu" }, { key: "minimumStock", label: "Minimum stok", numeric: true }, { key: "purchasePrice", label: "Alış fiyatı (TL)", numeric: true }, { key: "salePrice", label: "Satış fiyatı (TL)", numeric: true }],
  settings: [{ key: "bookingWindowDays", label: "Randevu alınabilecek gün sayısı", numeric: true }, { key: "minimumNoticeMinutes", label: "En erken randevu (dakika)", numeric: true }, { key: "cancellationNoticeMinutes", label: "İptal süresi (dakika)", numeric: true }],
};
function initialValues(section: PanelSection, row?: PanelRow, settings?: PanelSettings): Record<string, string | boolean> {
  if (section === "customers") return { fullName: row?.title ?? "", phone: row?.phone ?? "", email: row?.email ?? "", notes: row?.notes ?? "" };
  if (section === "services") return { name: row?.title ?? "", description: row?.description ?? "", durationMinutes: String(row?.duration_minutes ?? 30), price: String((row?.price_minor ?? 0) / 100), active: row?.active ?? true };
  if (section === "employees") return { displayName: row?.title ?? "", title: row?.roleTitle ?? "", bio: row?.bio ?? "", active: row?.active ?? true };
  if (section === "inventory") return { name: row?.title ?? "", sku: row?.sku ?? "", minimumStock: String(row?.minimum_stock ?? 0), purchasePrice: String((row?.purchase_price_minor ?? 0) / 100), salePrice: String((row?.sale_price_minor ?? 0) / 100), active: row?.active ?? true };
  return { bookingWindowDays: String(settings?.booking_window_days ?? 60), minimumNoticeMinutes: String(settings?.minimum_notice_minutes ?? 120), cancellationNoticeMinutes: String(settings?.cancellation_notice_minutes ?? 1440), autoConfirm: settings?.auto_confirm ?? true, allowWaitlist: settings?.allow_waitlist ?? false };
}
function RecordForm({ section, row, settings, onClose, onSave, busy, error }: { section: PanelSection; row?: PanelRow; settings?: PanelSettings; onClose: () => void; onSave: (body: Record<string, unknown>) => void; busy: boolean; error?: string }) {
  const [values, setValues] = useState(() => initialValues(section, row, settings));
  const [validation, setValidation] = useState("");
  const submit = () => {
    const payload: Record<string, unknown> = { ...values, ...(row ? { id: row.id } : {}) };
    for (const field of fields[section] ?? []) if (field.numeric) {
      const text = String(values[field.key]).trim().replace(",", ".");
      const number = Number(text);
      if (!text || !Number.isFinite(number)) { setValidation(`${field.label} için geçerli bir sayı gir.`); return; }
      payload[field.key] = number;
    }
    setValidation(""); onSave(payload);
  };
  return <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { if (!busy) onClose(); }}>
    <KeyboardAvoidingView style={styles.formScreen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.formHeader}><Text style={styles.heading}>{section === "settings" ? "Randevu ayarları" : row ? "Kaydı düzenle" : "Yeni kayıt"}</Text><Pressable disabled={busy} accessibilityLabel="Formu kapat" onPress={onClose}><X size={24} color={theme.colors.text} /></Pressable></View>
      <ScrollView contentContainerStyle={styles.formBody} keyboardShouldPersistTaps="handled">
        {(fields[section] ?? []).map((field) => <View key={field.key} style={{ gap: 8 }}><Text style={styles.label}>{field.label}</Text><TextInput accessibilityLabel={field.label} style={[styles.input, field.multiline && { minHeight: 90, textAlignVertical: "top" }]} value={String(values[field.key] ?? "")} onChangeText={(value) => setValues((prev) => ({ ...prev, [field.key]: value }))} keyboardType={field.numeric ? "decimal-pad" : field.key === "email" ? "email-address" : field.key === "phone" ? "phone-pad" : "default"} autoCapitalize={field.key === "email" ? "none" : "sentences"} multiline={field.multiline} maxLength={field.multiline ? 2000 : 120} /></View>)}
        {Object.keys(values).filter((key) => typeof values[key] === "boolean").map((key) => <View key={key} style={styles.switchRow}><Text style={styles.label}>{key === "active" ? "Aktif" : key === "autoConfirm" ? "Randevuları otomatik onayla" : "Bekleme listesini aç"}</Text><Switch accessibilityLabel={key === "active" ? "Aktif" : key === "autoConfirm" ? "Otomatik onay" : "Bekleme listesi"} value={Boolean(values[key])} onValueChange={(value) => setValues((prev) => ({ ...prev, [key]: value }))} trackColor={{ true: theme.colors.primary }} /></View>)}
        {error || validation ? <Text accessibilityRole="alert" style={styles.error}>{validation || error}</Text> : null}
        <AppButton label="Kaydet" busy={busy} onPress={submit} />
      </ScrollView>
    </KeyboardAvoidingView>
  </Modal>;
}

export default function ManagementSection() {
  const { section: rawSection } = useLocalSearchParams<{ section: string }>();
  const { scope } = useManagement();
  return <ManagementSectionContent key={`${rawSection}-${scope.businessId}-${scope.branchId}`} rawSection={rawSection} />;
}
function ManagementSectionContent({ rawSection }: { rawSection: string }) {
  const definition = panelSections.find((item) => item.key === rawSection);
  const section = definition?.key ?? "dashboard";
  const { context, scope, session, user } = useManagement();
  const queryClient = useQueryClient();
  const [date, setDate] = useState(today);
  const [search, setSearch] = useState("");
  const [settledSearch, setSettledSearch] = useState("");
  const [status, setStatus] = useState("");
  const [editor, setEditor] = useState<{ row?: PanelRow } | null>(null);
  const [teamEmployee, setTeamEmployee] = useState<PanelRow | null>(null);
  const [businessEditor, setBusinessEditor] = useState(false);
  const [campaignEditor, setCampaignEditor] = useState<{ id?: string } | null>(null);
  const [bookingEditor, setBookingEditor] = useState(false);
  const [packageManager, setPackageManager] = useState(false);
  useEffect(() => { const timer = setTimeout(() => setSettledSearch(search), 300); return () => clearTimeout(timer); }, [search]);
  const allowed = Boolean(context.data && canViewSection(context.data, section));
  const canWrite = context.data?.role === "OWNER" || context.data?.role === "MANAGER";
  const page = useInfiniteQuery({
    queryKey: ["business-panel", section, user?.id, scope, settledSearch, status, section === "calendar" ? date : ""],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => getPanelPage(section, session!.access_token, scope, { offset: pageParam, q: settledSearch, status, date: section === "calendar" ? date : undefined }),
    getNextPageParam: (last, pages) => last.hasMore ? pages.length * 50 : undefined,
    enabled: Boolean(session && scope.businessId && allowed && definition), retry: false,
  });
  const mutation = useMutation({
    mutationFn: (values: Record<string, unknown>) => savePanelRecord(section === "calendar" || section === "dashboard" ? "appointments" : section, session!.access_token, scope, values),
    onSuccess: async () => { setEditor(null); await queryClient.invalidateQueries({ queryKey: ["business-panel"] }); },
  });
  const execute = (body: Record<string, unknown>) => mutation.mutate(body, { onError: (error) => Alert.alert("İşlem tamamlanamadı", error.message) });
  const confirmStatus = (row: PanelRow, next: string) => Alert.alert("Randevuyu güncelle", `${row.title}: ${statuses[next]}`, [{ text: "Vazgeç", style: "cancel" }, { text: "Onayla", onPress: () => execute({ id: row.id, status: next }) }]);
  const rows = page.data?.pages.flatMap((part) => part.rows) ?? [];
  const first = page.data?.pages[0];
  if (!definition || !allowed) return <EmptyState title="Bölüm açılamadı" detail="Bu bölüm mevcut değil veya erişim yetkin bulunmuyor." />;
  const shiftDay = (delta: number) => { const next = new Date(`${date}T12:00:00Z`); next.setUTCDate(next.getUTCDate() + delta); setDate(next.toISOString().slice(0, 10)); };
  return <View style={{ flex: 1 }}>
    <FlatList data={rows} keyExtractor={(row) => row.id} contentContainerStyle={styles.content} initialNumToRender={10} maxToRenderPerBatch={10} windowSize={7} keyboardShouldPersistTaps="handled" refreshing={page.isRefetching} onRefresh={() => void page.refetch()}
      ListHeaderComponent={<>
        <View style={styles.titleRow}><View style={{ flex: 1 }}><Text style={styles.heading}>{definition.label}</Text><Text style={styles.description}>{definition.description}</Text></View>{editable.includes(section) && canWrite ? <Pressable accessibilityRole="button" accessibilityLabel="Yeni kayıt ekle" style={styles.addButton} onPress={() => { mutation.reset(); setEditor({}); }}><Plus size={22} color="#fff" /></Pressable> : null}</View>
        {section === "settings" && canWrite ? <AppButton label="İşletme profili ve saatleri" variant="secondary" onPress={() => setBusinessEditor(true)} /> : null}
        {section === "campaigns" && canWrite ? <AppButton label="Yeni kampanya" onPress={() => setCampaignEditor({})} /> : null}
        {["dashboard", "calendar", "appointments"].includes(section) && canWrite && context.data?.permissions.calendar ? <AppButton label="Müşteri adına randevu" onPress={() => setBookingEditor(true)} /> : null}
        {section === "operations" && canWrite && context.data?.permissions.operations ? <AppButton label="Paketler ve seanslar" onPress={() => setPackageManager(true)} /> : null}
        {section === "dashboard" && first?.metrics ? <View style={styles.metrics}>{first.metrics.map((metric) => { const Icon = metricIcons[metric.icon] ?? CalendarDays; return <View key={metric.label} style={styles.metric}><View style={styles.metricIcon}><Icon size={22} color={theme.colors.primary} /></View><Text style={styles.metricValue}>{metric.value}</Text><Text style={styles.description}>{metric.label}</Text></View>; })}</View> : null}
        {section === "calendar" ? <View style={styles.dateRow}><Pressable accessibilityLabel="Önceki gün" onPress={() => shiftDay(-1)} style={styles.dateButton}><ChevronLeft color={theme.colors.primary} size={22} /></Pressable><Text style={styles.label}>{new Date(`${date}T12:00:00Z`).toLocaleDateString("tr-TR", { day: "numeric", month: "long", weekday: "short" })}</Text><Pressable accessibilityLabel="Sonraki gün" onPress={() => shiftDay(1)} style={styles.dateButton}><ChevronRight color={theme.colors.primary} size={22} /></Pressable><Chip label="Bugün" onPress={() => setDate(today())} /></View> : null}
        {editable.includes(section) || section === "campaigns" ? <View style={styles.search}><Search size={18} color={theme.colors.muted} /><TextInput accessibilityLabel="Panelde ara" placeholder="İsim veya ad ile ara..." value={search} onChangeText={setSearch} style={{ flex: 1, color: theme.colors.text, paddingVertical: 12 }} /></View> : null}
        {section === "appointments" ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}><Chip label="Tümü" selected={!status} onPress={() => setStatus("")} />{["pending", "confirmed", "completed", "cancelled", "no_show"].map((value) => <Chip key={value} label={statuses[value]} selected={status === value} onPress={() => setStatus(value)} />)}</ScrollView> : null}
        {section === "dashboard" ? <Text style={styles.subheading}>Bugünkü randevular</Text> : null}
        {section === "settings" && first?.settings ? <View style={styles.card}><View style={styles.cardTitle}><CheckCircle2 color={theme.colors.primary} size={22} /><Text style={styles.subheading}>Randevu kuralları</Text></View><Text style={styles.description}>Randevu penceresi: {first.settings.booking_window_days} gün</Text><Text style={styles.description}>En erken randevu: {first.settings.minimum_notice_minutes} dakika</Text><Text style={styles.description}>İptal sınırı: {first.settings.cancellation_notice_minutes} dakika</Text><Text style={styles.description}>Otomatik onay: {first.settings.auto_confirm ? "Açık" : "Kapalı"}</Text><Text style={styles.description}>Bekleme listesi: {first.settings.allow_waitlist ? "Açık" : "Kapalı"}</Text><AppButton label="Ayarları düzenle" onPress={() => { mutation.reset(); setEditor({}); }} /></View> : null}
        {page.isPending ? <LoadingState label="Veriler yükleniyor..." /> : null}
        {page.isError ? <EmptyState title="Veriler alınamadı" detail={page.error.message} action={<AppButton label="Yeniden dene" onPress={() => void page.refetch()} />} /> : null}
      </>}
      renderItem={({ item: row }) => <View style={styles.card}>
        <View style={styles.cardTitle}><View style={{ flex: 1 }}><Text style={styles.rowTitle}>{row.title}</Text><Text style={styles.description}>{row.subtitle}</Text></View>{row.status ? <View style={[styles.badge, row.status === "cancelled" && { backgroundColor: "#FEF3F2" }]}><Text style={styles.badgeText}>{statuses[row.status] ?? row.status}</Text></View> : row.active !== undefined ? <Text style={styles.description}>{row.active ? "Aktif" : "Pasif"}</Text> : null}</View>
        {row.startsAt ? <Text style={styles.label}>{new Date(row.startsAt).toLocaleDateString("tr-TR", { day: "numeric", month: "short", timeZone: "Europe/Istanbul" })} · {new Date(row.startsAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" })}{row.endsAt ? ` – ${new Date(row.endsAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" })}` : ""}</Text> : null}
        {row.amountMinor !== undefined ? <Text style={styles.price}>{money(row.amountMinor)}</Text> : null}
        {row.price_minor !== undefined ? <Text style={styles.price}>{money(row.price_minor)}</Text> : null}
        {section === "employees" && canWrite ? <AppButton label="Hizmetler ve müsaitlik" variant="secondary" onPress={() => setTeamEmployee(row)} /> : null}
        {section === "campaigns" && canWrite ? <AppButton label="Kampanya düzenle" variant="secondary" onPress={() => setCampaignEditor({ id: row.id })} /> : null}
        {section === "inventory" ? <View style={styles.stock}><Package size={18} color={theme.colors.primary} /><Text style={styles.label}>Stok: {row.stock_quantity ?? 0} · Minimum: {row.minimum_stock ?? 0}</Text></View> : null}
        {(section === "appointments" || section === "calendar" || section === "dashboard") && context.data?.permissions.calendar && ["pending", "confirmed"].includes(row.status ?? "") ? <View style={styles.actions}>{row.status === "pending" ? <Chip label="Onayla" onPress={() => { if (!mutation.isPending) confirmStatus(row, "confirmed"); }} /> : <><Chip label="Tamamlandı" onPress={() => { if (!mutation.isPending) confirmStatus(row, "completed"); }} /><Chip label="Gelmedi" onPress={() => { if (!mutation.isPending) confirmStatus(row, "no_show"); }} /></>}<Chip label="İptal et" onPress={() => { if (!mutation.isPending) confirmStatus(row, "cancelled"); }} /></View> : null}
        {editable.includes(section) && canWrite ? <View style={styles.actions}><Chip label="Düzenle" onPress={() => { mutation.reset(); setEditor({ row }); }} />{section === "inventory" ? <><Chip label="Stok +1" onPress={() => { if (!mutation.isPending) execute({ id: row.id, quantity: 1, note: "Mobil stok girişi" }); }} /><Chip label="Stok −1" onPress={() => { if (!mutation.isPending) execute({ id: row.id, quantity: -1, note: "Mobil stok çıkışı" }); }} /></> : null}</View> : null}
        {section === "campaigns" && canWrite && row.status !== "cancelled" ? <View style={styles.actions}><Chip label={row.status === "active" ? "Taslağa al" : "Aktifleştir"} onPress={() => { if (!mutation.isPending) execute({ id: row.id, status: row.status === "active" ? "draft" : "active" }); }} /><Chip label="Kampanyayı iptal et" onPress={() => Alert.alert("Kampanyayı iptal et", "Bu kampanyayı iptal etmek istediğinden emin misin?", [{ text: "Vazgeç", style: "cancel" }, { text: "İptal et", style: "destructive", onPress: () => execute({ id: row.id, status: "cancelled" }) }])} /></View> : null}
      </View>}
      ListEmptyComponent={!page.isPending && !page.isError && section !== "settings" ? <EmptyState title="Henüz kayıt yok" detail={section === "calendar" || section === "dashboard" ? "Bu gün için randevu bulunmuyor." : "Filtrelerinle eşleşen kayıt bulunamadı."} /> : null}
      ListFooterComponent={page.hasNextPage ? <AppButton label="Daha fazla kayıt" variant="secondary" busy={page.isFetchingNextPage} onPress={() => void page.fetchNextPage()} /> : null}
    />
    {editor ? <RecordForm key={`${section}-${editor.row?.id ?? "new"}`} section={section} row={editor.row} settings={first?.settings} busy={mutation.isPending} error={mutation.error?.message} onClose={() => setEditor(null)} onSave={(values) => mutation.mutate(values)} /> : null}
    {teamEmployee ? <TeamManager key={teamEmployee.id} employee={teamEmployee} onClose={() => setTeamEmployee(null)} /> : null}
    {businessEditor ? <BusinessProfileEditor onClose={() => setBusinessEditor(false)} /> : null}
    {campaignEditor ? <CampaignEditor key={campaignEditor.id ?? "new"} campaignId={campaignEditor.id} onClose={() => setCampaignEditor(null)} onSaved={() => { void queryClient.invalidateQueries({ queryKey: ["business-panel"] }); }} /> : null}
    {bookingEditor ? <BusinessBookingEditor onClose={() => setBookingEditor(false)} onSaved={async () => { await queryClient.invalidateQueries({ queryKey: ["business-panel"] }); }} /> : null}
    {packageManager ? <PackageManager onClose={() => setPackageManager(false)} /> : null}
  </View>;
}
const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 36 }, titleRow: { flexDirection: "row", gap: 12, alignItems: "center", marginVertical: 8 }, heading: { fontSize: 24, fontWeight: theme.typography.weight.semibold, color: theme.colors.text, letterSpacing: -0.5 }, description: { color: theme.colors.muted, fontSize: 12, lineHeight: 19, marginTop: 3 }, addButton: { width: 44, height: 44, borderRadius: 12, backgroundColor: theme.colors.primary, justifyContent: "center", alignItems: "center" },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginVertical: 12 }, metric: { width: "48%", backgroundColor: "#fff", borderRadius: 16, borderWidth: 1, borderColor: theme.colors.border, padding: 16, gap: 7 }, metricIcon: { backgroundColor: theme.colors.primarySoft, width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" }, metricValue: { color: theme.colors.text, fontSize: 28, fontWeight: theme.typography.weight.semibold },
  subheading: { color: theme.colors.text, fontSize: 17, fontWeight: theme.typography.weight.semibold, marginVertical: 6 }, search: { backgroundColor: "#fff", borderWidth: 1, borderColor: theme.colors.border, borderRadius: 12, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 8 }, filters: { gap: 8, paddingVertical: 10 }, dateRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 6, marginVertical: 12 }, dateButton: { padding: 8, backgroundColor: "#fff", borderRadius: 10 },
  card: { backgroundColor: "#fff", borderRadius: 16, borderWidth: 1, borderColor: theme.colors.border, padding: 16, gap: 8 }, cardTitle: { flexDirection: "row", alignItems: "center", gap: 10 }, rowTitle: { color: theme.colors.text, fontSize: 15, fontWeight: theme.typography.weight.semibold }, badge: { backgroundColor: theme.colors.primarySoft, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8 }, badgeText: { fontSize: 10, color: theme.colors.primaryDark, fontWeight: "600" }, label: { color: theme.colors.text, fontSize: 13, fontWeight: "600" }, price: { color: theme.colors.primary, fontWeight: theme.typography.weight.semibold, fontSize: 14 }, actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 }, stock: { flexDirection: "row", gap: 8, alignItems: "center" },
  formScreen: { flex: 1, backgroundColor: "#fff", paddingTop: 20 }, formHeader: { padding: 20, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: theme.colors.border }, formBody: { padding: 20, gap: 20, paddingBottom: 48 }, input: { borderColor: theme.colors.border, borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 15, color: theme.colors.text, backgroundColor: "#fff" }, switchRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 }, error: { color: theme.colors.danger, fontSize: 13, lineHeight: 20 },
});
