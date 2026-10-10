import { useEffect, useState } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { randomUUID } from "expo-crypto";
import { Layers, X } from "lucide-react-native";
import { AppButton, Chip, LoadingState } from "@/components/app-ui";
import { FormField } from "@/components/form-field";
import { theme } from "@/constants/theme";
import { Alert } from "@/lib/alert";
import { getResourcePage, saveResource, type BusinessResource, type ResourceService, type ResourceUsage, type ResourceWrite } from "@/lib/resource-management";
import { useManagement } from "@/providers/management-provider";

const kinds: Record<BusinessResource["kind"], string> = { room: "Oda", chair: "Koltuk", device: "Cihaz", other: "Diğer" };
function useSearch(value: string) { const [result, setResult] = useState(value); useEffect(() => { const timer = setTimeout(() => setResult(value.trim()), 300); return () => clearTimeout(timer); }, [value]); return result; }

function ResourceForm({ resource, busy, onSave, onDirty }: { resource?: BusinessResource; busy: boolean; onSave: (values: ResourceWrite) => void; onDirty: () => void }) {
  const [id] = useState(() => resource?.id ?? randomUUID()); const [name, setName] = useState(resource?.name ?? ""); const [capacity, setCapacity] = useState(String(resource?.capacity ?? 1));
  const [kind, setKind] = useState<BusinessResource["kind"]>(resource?.kind ?? "chair"); const [active, setActive] = useState(resource?.active ?? true); const [errors, setErrors] = useState<Record<string, string>>({});
  const submit = () => {
    const next: Record<string, string> = {};
    if (name.trim().length < 2 || name.trim().length > 120) next.name = "Kaynak adı 2–120 karakter olmalı.";
    if (!/^\d+$/.test(capacity) || Number(capacity) < 1 || Number(capacity) > 100) next.capacity = "Kapasite 1–100 arasında tam sayı olmalı.";
    setErrors(next); if (Object.keys(next).length || busy) return;
    onSave(resource ? { action: "update", id, name: name.trim(), capacity: Number(capacity), active } : { action: "create", id, name: name.trim(), kind, capacity: Number(capacity), active });
  };
  return <View style={styles.group}>
    <FormField label="Kaynak adı" placeholder="Örneğin: Bakım odası" value={name} onChangeText={(value) => { setName(value); onDirty(); setErrors((old) => ({ ...old, name: "" })); }} maxLength={120} editable={!busy} error={errors.name} />
    {resource ? <Text style={styles.note}>Tür: {kinds[resource.kind]}. Kaynağın türü ve şubesi korunur; farklı bir kaynak için yeni kayıt oluştur.</Text> : <><Text style={styles.label}>Kaynak türü</Text><View style={styles.wrap}>{Object.entries(kinds).map(([value, label]) => <Chip key={value} label={label} selected={kind === value} onPress={() => { if (!busy) { setKind(value as BusinessResource["kind"]); onDirty(); } }} />)}</View></>}
    <FormField label="Eşzamanlı kapasite" value={capacity} onChangeText={(value) => { setCapacity(value); onDirty(); setErrors((old) => ({ ...old, capacity: "" })); }} keyboardType="number-pad" maxLength={3} editable={!busy} error={errors.capacity} hint="Aynı anda kaç birim kullanılabilir? Hizmetin her randevuda ihtiyaç duyduğu miktar ayrı tanımlanır." />
    <View style={styles.line}><Text style={styles.label}>Rezervasyona açık</Text><Switch accessibilityLabel="Kaynak aktif" value={active} disabled={busy} onValueChange={(value) => { setActive(value); onDirty(); }} trackColor={{ true: theme.colors.primary }} /></View>
    <View style={styles.info}><Text style={styles.note}>Devam eden veya gelecek rezervasyonlar varken kapasite azaltılamaz ve kaynak pasife alınamaz. Geçmiş kayıtlar silinmez.</Text><Text style={styles.note}>Pasif kaynak hâlâ bir hizmete bağlıysa o hizmet yeni randevu alamaz. Hizmet ihtiyacını kaldır veya kaynağı yeniden aktifleştir.</Text></View>
    <AppButton label={resource ? "Kaynak bilgilerini kaydet" : "Kaynağı oluştur"} busy={busy} onPress={submit} />
  </View>;
}

function ServiceForm({ resource, service, busy, onSave, onDirty }: { resource: BusinessResource; service: ResourceService; busy: boolean; onSave: (values: ResourceWrite) => void; onDirty: () => void }) {
  const [assigned, setAssigned] = useState(service.assigned); const [quantity, setQuantity] = useState(String(service.quantity)); const [error, setError] = useState("");
  return <View style={styles.group}>
    <View style={styles.card}><Text style={styles.heading}>{service.name}</Text><Text style={styles.note}>Kaynak: {resource.name} · kapasite {resource.capacity}</Text><Text style={styles.note}>Bu kayıt yalnızca bu hizmetin bu kaynağa bağlantısını değiştirir. Diğer hizmetler ve kaynaklar korunur.</Text></View>
    <View style={styles.line}><Text style={styles.label}>Her randevuda gerekli</Text><Switch accessibilityLabel="Hizmet bu kaynağı gerektiriyor" value={assigned} disabled={busy} onValueChange={(value) => { setAssigned(value); setError(""); onDirty(); }} trackColor={{ true: theme.colors.primary }} /></View>
    {assigned ? <FormField label="Randevu başına gereken birim" value={quantity} onChangeText={(value) => { setQuantity(value); setError(""); onDirty(); }} keyboardType="number-pad" maxLength={3} editable={!busy} hint={`En fazla ${resource.capacity} birim.`} /> : <Text style={styles.note}>Bu hizmet kaynaktan kapasite ayırmayacak. Mevcut randevuların rezervasyonları korunur.</Text>}
    {!resource.active || !service.active ? <Text style={styles.warning}>Kaynak ve hizmet aktif olmadan yeni ihtiyaç tanımlanamaz. Mevcut bağlantıyı kaldırabilirsin.</Text> : null}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    <AppButton label="Hizmet ihtiyacını kaydet" busy={busy} onPress={() => {
      if (busy) return;
      if (assigned && (!resource.active || !service.active)) { setError("Yeni bağlantı için kaynak ve hizmet aktif olmalı."); return; }
      if (assigned && (!/^\d+$/.test(quantity) || Number(quantity) < 1 || Number(quantity) > resource.capacity)) { setError(`Gereken birim 1–${resource.capacity} arasında tam sayı olmalı.`); return; }
      onSave({ action: "link", id: resource.id, serviceId: service.id, assigned, quantity: assigned ? Number(quantity) : service.quantity });
    }} />
  </View>;
}

function Services({ resource, busy, onEdit }: { resource: BusinessResource; busy: boolean; onEdit: (service: ResourceService) => void }) {
  const { session, user, scope } = useManagement(); const [search, setSearch] = useState(""); const q = useSearch(search);
  const query = useInfiniteQuery({ queryKey: ["business-resource-services", user?.id, scope, resource.id, q], initialPageParam: 0, queryFn: ({ pageParam, signal }) => getResourcePage<ResourceService>(session!.access_token, scope, "services", { resourceId: resource.id, q, offset: pageParam }, signal), getNextPageParam: (last, pages) => last.hasMore ? pages.length * 25 : undefined, enabled: Boolean(session && scope.businessId), retry: false });
  return <View style={styles.group}>
    <Text style={styles.heading}>{resource.name} · hizmet ihtiyaçları</Text><Text style={styles.note}>Bir hizmet birden fazla kaynağa bağlı olabilir. Her randevuda gereken birimler birlikte kontrol edilir.</Text>
    {!resource.active ? <Text style={styles.warning}>Kaynak pasif. Bağlı hizmetlerin yeni randevuları engellenir; bağlantıyı kaldır veya kaynağı aktifleştir.</Text> : null}
    <FormField label="Kaynağa bağlanacak hizmet ara" placeholder="Hizmet adı" value={search} onChangeText={setSearch} maxLength={120} editable={!busy} />
    {query.isPending ? <LoadingState label="Hizmet ihtiyaçları yükleniyor..." /> : null}
    {query.error ? <><Text accessibilityRole="alert" style={styles.error}>{query.error.message}</Text><AppButton label="Hizmet ihtiyaçlarını yeniden yükle" onPress={() => void query.refetch()} /></> : null}
    {query.data?.pages.flatMap((page) => page.rows).map((row) => <View key={row.id} style={styles.card}><Text style={styles.label}>{row.name}</Text><Text style={styles.note}>{row.assigned ? `Her randevu için ${row.quantity} birim gerekli` : "Bu kaynağa bağlı değil"}{!row.active ? " · hizmet pasif" : ""}</Text><AppButton label={`İhtiyacı düzenle: ${row.name}`} variant="secondary" disabled={busy} onPress={() => onEdit(row)} /></View>)}
    {query.data && !query.data.pages[0].rows.length ? <Text style={styles.note}>Seçili şubede eşleşen hizmet bulunamadı.</Text> : null}
    {query.hasNextPage ? <AppButton label="Daha fazla hizmet ihtiyacı" variant="secondary" busy={query.isFetchingNextPage} onPress={() => void query.fetchNextPage()} /> : null}
  </View>;
}

function Usage({ resource }: { resource: BusinessResource }) {
  const { session, user, scope } = useManagement(); const [openedAt] = useState(() => Date.now()); const [days, setDays] = useState(7);
  const from = new Date(openedAt).toISOString(); const to = new Date(openedAt + days * 86_400_000).toISOString();
  const query = useInfiniteQuery({ queryKey: ["business-resource-usage", user?.id, scope, resource.id, from, to], initialPageParam: 0, queryFn: ({ pageParam, signal }) => getResourcePage<ResourceUsage>(session!.access_token, scope, "usage", { resourceId: resource.id, from, to, offset: pageParam }, signal), getNextPageParam: (last, pages) => last.hasMore ? pages.length * 25 : undefined, enabled: Boolean(session && scope.businessId), retry: false });
  const first = query.data?.pages[0]; const timezone = first?.timezone ?? "Europe/Istanbul"; const format = (value: string) => new Date(value).toLocaleString("tr-TR", { timeZone: timezone, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  return <View style={styles.group}>
    <Text style={styles.heading}>{resource.name} · kapasite kullanımı</Text><Text style={styles.note}>Şu andan itibaren devam eden ve gelecek, serbest bırakılmamış rezervasyonlar. Saatler: {timezone}.</Text>
    <View style={styles.wrap}>{[1, 7, 30].map((value) => <Chip key={value} label={value === 1 ? "24 saat" : `${value} gün`} selected={days === value} onPress={() => setDays(value)} />)}</View>
    <Text style={styles.note}>{format(from)} – {format(to)}</Text>
    {query.isPending ? <LoadingState label="Kapasite kullanımı yükleniyor..." /> : null}
    {query.error ? <><Text accessibilityRole="alert" style={styles.error}>{query.error.message}</Text><AppButton label="Kapasite kullanımını yeniden yükle" onPress={() => void query.refetch()} /></> : null}
    {first?.summary ? <View style={styles.info}><Text style={styles.balance}>En yoğun anda {first.summary.peakUnits} / {resource.capacity} birim</Text><Text style={styles.note}>{first.summary.appointmentCount} ayrı randevu · {first.summary.reservationCount} rezervasyon birimi</Text><Text style={styles.note}>Özet seçili aralığın tamamını kapsar, yalnızca yüklenen satırları değil. Ardışık randevular eşzamanlı kullanım sayılmaz.</Text></View> : null}
    {query.data?.pages.flatMap((page) => page.rows).map((row) => <View key={row.id} style={styles.card}><Text style={styles.label}>{format(row.startsAt)} – {format(row.endsAt)}</Text><Text style={styles.note}>1 kapasite birimi · randevu #{row.appointmentId.slice(-8)}</Text></View>)}
    {first && !first.rows.length ? <Text style={styles.note}>Bu aralıkta kayıtlı rezervasyon yok.</Text> : null}
    {query.hasNextPage ? <AppButton label="Daha fazla rezervasyon birimi" variant="secondary" busy={query.isFetchingNextPage} onPress={() => void query.fetchNextPage()} /> : null}
    <Text style={styles.note}>Kullanım salt okunurdur; müşteri iletişim bilgisi gösterilmez. Randevu iptal edildiğinde kapasite mevcut sistem tarafından serbest bırakılır.</Text>
  </View>;
}

type ViewState = { kind: "create" } | { kind: "update" | "services" | "usage"; resource: BusinessResource } | { kind: "link"; resource: BusinessResource; service: ResourceService };
export function ResourceManager({ onClose }: { onClose: () => void }) {
  const { session, user, scope, context } = useManagement(); const client = useQueryClient(); const insets = useSafeAreaInsets();
  const [search, setSearch] = useState(""); const q = useSearch(search); const [view, setView] = useState<ViewState | null>(null); const [dirty, setDirty] = useState(false); const [success, setSuccess] = useState("");
  const query = useInfiniteQuery({ queryKey: ["business-resources", user?.id, scope, q], initialPageParam: 0, queryFn: ({ pageParam, signal }) => getResourcePage<BusinessResource>(session!.access_token, scope, "resources", { q, offset: pageParam }, signal), getNextPageParam: (last, pages) => last.hasMore ? pages.length * 25 : undefined, enabled: Boolean(session && scope.businessId), retry: false });
  const mutation = useMutation({ mutationFn: (values: ResourceWrite) => saveResource(session!.access_token, scope, values), retry: false, onSuccess: async (_, values) => {
    setDirty(false); setSuccess(values.action === "link" ? "Hizmet ihtiyacı kaydedildi." : "Kaynak kaydedildi.");
    if (view?.kind === "link") setView({ kind: "services", resource: view.resource }); else setView(null);
    await Promise.all([client.invalidateQueries({ queryKey: ["business-resources", user?.id] }), client.invalidateQueries({ queryKey: ["business-resource-services", user?.id] }), client.invalidateQueries({ queryKey: ["business-resource-usage", user?.id] }), client.invalidateQueries({ queryKey: ["business-panel"] })]);
  } });
  const busy = mutation.isPending;
  const leave = (callback: () => void) => { if (busy) return; if (!dirty) callback(); else Alert.alert("Değişiklikler kaydedilmedi", "Girdiğin bilgileri bırakmak istiyor musun?", [{ text: "Devam et", style: "cancel" }, { text: "Değişiklikleri bırak", style: "destructive", onPress: () => { setDirty(false); callback(); } }]); };
  const open = (next: ViewState) => { setView(next); setDirty(false); setSuccess(""); mutation.reset(); };
  const save = (values: ResourceWrite) => { if (!busy) mutation.mutate(values); };
  return <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={() => leave(onClose)}>
    <KeyboardAvoidingView style={[styles.screen, { paddingTop: Math.max(16, insets.top) }]} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.header}><Layers size={23} color={theme.colors.primary} /><View style={{ flex: 1 }}><Text style={styles.heading}>{view?.kind === "create" ? "Yeni şube kaynağı" : view?.kind === "update" ? "Kaynak bilgileri" : "Kaynak yönetimi"}</Text><Text style={styles.note}>{context.data?.branch.name ?? "Seçili şube"} · oda, koltuk ve cihaz kapasitesi</Text></View><Pressable style={styles.close} accessibilityRole="button" accessibilityLabel="Kaynak ekranını kapat" disabled={busy} onPress={() => leave(onClose)}><X size={23} color={theme.colors.text} /></Pressable></View>
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: 32 + insets.bottom }]} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        {mutation.error ? <Text accessibilityRole="alert" style={styles.error}>{mutation.error.message}</Text> : null}
        {success ? <Text accessibilityRole="alert" style={styles.success}>{success}</Text> : null}
        {view ? <>
          <AppButton label={view.kind === "link" ? "Hizmet ihtiyaçlarına dön" : "Kaynak listesine dön"} variant="ghost" disabled={busy} onPress={() => leave(() => { setView(view.kind === "link" ? { kind: "services", resource: view.resource } : null); mutation.reset(); })} />
          {view.kind === "create" || view.kind === "update" ? <ResourceForm key={view.kind === "update" ? view.resource.id : "new"} resource={view.kind === "update" ? view.resource : undefined} busy={busy} onSave={save} onDirty={() => setDirty(true)} /> : view.kind === "link" ? <ServiceForm key={`${view.resource.id}-${view.service.id}`} resource={view.resource} service={view.service} busy={busy} onSave={save} onDirty={() => setDirty(true)} /> : view.kind === "services" ? <Services key={view.resource.id} resource={view.resource} busy={busy} onEdit={(service) => open({ kind: "link", resource: view.resource, service })} /> : <Usage key={view.resource.id} resource={view.resource} />}
        </> : <>
          <View style={styles.info}><Text style={styles.note}>Kaynaklar seçili şubeye aittir. Önce kaynak oluştur, ardından hizmete gereken birimleri bağla. Çakışmalar randevu kaydında atomik olarak kontrol edilir.</Text></View>
          <FormField label="Şube kaynağı ara" placeholder="Oda, koltuk veya cihaz adı" value={search} onChangeText={setSearch} maxLength={120} />
          <AppButton label="Yeni şube kaynağı" disabled={!query.data || Boolean(query.error)} onPress={() => open({ kind: "create" })} />
          {query.isPending ? <LoadingState label="Şube kaynakları yükleniyor..." /> : null}
          {query.error ? <><Text accessibilityRole="alert" style={styles.error}>{query.error.message}</Text><AppButton label="Şube kaynaklarını yeniden yükle" onPress={() => void query.refetch()} /></> : null}
          {query.data?.pages.flatMap((page) => page.rows).map((row) => <View key={row.id} style={styles.card}><Text style={styles.heading}>{row.name}</Text><Text style={styles.note}>{kinds[row.kind]} · eşzamanlı {row.capacity} birim · {row.active ? "aktif" : "pasif"}</Text>{!row.active ? <Text style={styles.warning}>Bağlı hizmetler yeni randevu alamaz.</Text> : null}<AppButton label={`Kaynağı düzenle: ${row.name}`} variant="secondary" onPress={() => open({ kind: "update", resource: row })} /><AppButton label={`Hizmet ihtiyaçları: ${row.name}`} variant="secondary" onPress={() => open({ kind: "services", resource: row })} /><AppButton label={`Kapasite kullanımı: ${row.name}`} variant="ghost" onPress={() => open({ kind: "usage", resource: row })} /></View>)}
          {query.data && !query.data.pages[0].rows.length ? <Text style={styles.note}>{q ? "Aramana uygun şube kaynağı yok." : "Henüz bu şubeye kaynak eklenmemiş."}</Text> : null}
          {query.hasNextPage ? <AppButton label="Daha fazla şube kaynağı" variant="secondary" busy={query.isFetchingNextPage} onPress={() => void query.fetchNextPage()} /> : null}
          <Text style={styles.note}>Kaynaklar silinmez veya başka şubeye taşınmaz. Böylece geçmiş rezervasyon bağlantıları korunur.</Text>
        </>}
      </ScrollView>
    </KeyboardAvoidingView>
  </Modal>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F8F8FA" }, header: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 20, paddingVertical: 14, backgroundColor: theme.colors.surface }, close: { minHeight: 44, minWidth: 44, alignItems: "center", justifyContent: "center" },
  heading: { color: theme.colors.text, fontSize: 19, lineHeight: 27, fontWeight: theme.typography.weight.semibold }, label: { color: theme.colors.text, fontSize: 14, lineHeight: 21, fontWeight: theme.typography.weight.medium }, note: { color: theme.colors.muted, fontSize: 13, lineHeight: 21 },
  body: { padding: 20, gap: 16 }, group: { gap: 16 }, wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, line: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }, card: { padding: 16, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 16, backgroundColor: theme.colors.surface, gap: 12 }, info: { padding: 14, borderRadius: 12, backgroundColor: theme.colors.primarySoft, gap: 8 }, balance: { color: theme.colors.primary, fontSize: 19, lineHeight: 27, fontWeight: theme.typography.weight.medium }, error: { color: theme.colors.danger, fontSize: 14, lineHeight: 21 }, warning: { color: "#8A4B16", fontSize: 13, lineHeight: 21 }, success: { color: theme.colors.success, fontSize: 14, lineHeight: 21 },
});
