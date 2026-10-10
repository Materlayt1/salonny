import { useEffect, useState } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { randomUUID } from "expo-crypto";
import { Package, X } from "lucide-react-native";
import { AppButton, Chip, LoadingState } from "@/components/app-ui";
import { FormField } from "@/components/form-field";
import { theme } from "@/constants/theme";
import { Alert } from "@/lib/alert";
import { getPackagePage, savePackage, type PackageChoice, type PackageGrant, type PackageTemplate, type PackageWrite } from "@/lib/package-management";
import { useManagement } from "@/providers/management-provider";

function useSearch(value: string) { const [result, setResult] = useState(value); useEffect(() => { const timer = setTimeout(() => setResult(value.trim()), 300); return () => clearTimeout(timer); }, [value]); return result; }
function ChoicePicker({ mode, busy, onSelect }: { mode: "customers" | "services"; busy: boolean; onSelect: (row: PackageChoice) => void }) {
  const { session, user, scope } = useManagement(); const [search, setSearch] = useState(""); const q = useSearch(search);
  const query = useInfiniteQuery({ queryKey: ["business-package-choice", user?.id, scope, mode, q], initialPageParam: 0, queryFn: ({ pageParam, signal }) => getPackagePage<PackageChoice>(session!.access_token, scope, mode, q, pageParam, signal), getNextPageParam: (last, pages) => last.hasMore ? pages.length * 25 : undefined, enabled: Boolean(session && scope.businessId), retry: false });
  return <View style={styles.group}>
    <FormField label={mode === "customers" ? "Paket için müşteri ara" : "Paket için hizmet ara"} placeholder="Adı yaz" value={search} onChangeText={setSearch} maxLength={120} editable={!busy} />
    {query.isPending ? <LoadingState label="Seçenekler yükleniyor..." /> : null}
    {query.error ? <><Text accessibilityRole="alert" style={styles.error}>{query.error.message}</Text><AppButton label="Seçenekleri yeniden yükle" onPress={() => void query.refetch()} /></> : null}
    {query.data?.pages.flatMap((page) => page.rows).map((row) => <AppButton key={row.id} label={row.name} accessibilityLabel={`${mode === "customers" ? "Müşteri" : "Hizmet"} seç: ${row.name}`} variant="secondary" disabled={busy} onPress={() => onSelect(row)} />)}
    {query.data && !query.data.pages[0].rows.length ? <Text style={styles.note}>Eşleşen {mode === "customers" ? "müşteri" : "aktif hizmet"} bulunamadı.</Text> : null}
    {query.hasNextPage ? <AppButton label="Daha fazla seçenek" variant="ghost" busy={query.isFetchingNextPage} disabled={busy} onPress={() => void query.fetchNextPage()} /> : null}
  </View>;
}

function TemplateForm({ template, busy, onSave, onDirty }: { template?: PackageTemplate; busy: boolean; onSave: (values: PackageWrite) => void; onDirty: () => void }) {
  const [id] = useState(() => template?.id ?? randomUUID()); const [name, setName] = useState(template?.name ?? "");
  const [count, setCount] = useState(String(template?.sessionCount ?? 5)); const [days, setDays] = useState(String(template?.validityDays ?? 365));
  const [active, setActive] = useState(template?.active ?? true); const [service, setService] = useState<PackageChoice | null>(template?.serviceId ? { id: template.serviceId, name: template.serviceName ?? "Hizmet" } : null);
  const [picking, setPicking] = useState(false); const [errors, setErrors] = useState<Record<string, string>>({});
  const change = (setter: (value: string) => void, key: string, value: string) => { setter(value); onDirty(); setErrors((old) => ({ ...old, [key]: "" })); };
  const submit = () => {
    const next: Record<string, string> = {};
    if (name.trim().length < 2 || name.trim().length > 120) next.name = "Paket adı 2–120 karakter olmalı.";
    if (!/^\d+$/.test(days) || Number(days) < 1 || Number(days) > 3650) next.days = "Geçerlilik 1–3650 gün olmalı.";
    if (!template && (!/^\d+$/.test(count) || Number(count) < 1 || Number(count) > 1000)) next.count = "Seans sayısı 1–1000 arasında tam sayı olmalı.";
    setErrors(next); if (Object.keys(next).length) return;
    onSave(template ? { action: "update", id, name: name.trim(), validityDays: Number(days), active } : { action: "create", id, name: name.trim(), sessionCount: Number(count), validityDays: Number(days), serviceId: service?.id ?? null, active });
  };
  return <View style={styles.group}>
    <FormField label="Paket adı" placeholder="Örneğin: 5 seans bakım" value={name} onChangeText={(value) => change(setName, "name", value)} maxLength={120} editable={!busy} error={errors.name} />
    {template ? <View style={styles.info}><Text style={styles.label}>{template.sessionCount} seans · {template.serviceName ?? "Tüm hizmetler"}</Text><Text style={styles.note}>Hizmet ve seans sayısı korunur; farklı içerik için yeni paket oluştur. Ad veya aktiflik değişikliği eski müşteri paketlerini silmez.</Text></View> : <>
      <FormField label="Paket seans sayısı" value={count} onChangeText={(value) => change(setCount, "count", value)} keyboardType="number-pad" maxLength={4} editable={!busy} error={errors.count} />
      <Text style={styles.label}>Paket hizmeti</Text><Chip label="Tüm hizmetler" selected={!service} onPress={() => { if (!busy) { setService(null); setPicking(false); onDirty(); } }} />
      {service ? <Text style={styles.note}>Seçili: {service.name}</Text> : null}
      <AppButton label="Belirli hizmet seç" variant="secondary" disabled={busy} onPress={() => setPicking((old) => !old)} />
      {picking ? <ChoicePicker mode="services" busy={busy} onSelect={(row) => { setService(row); setPicking(false); onDirty(); }} /> : null}
    </>}
    <FormField label="Paket geçerlilik günü" value={days} onChangeText={(value) => change(setDays, "days", value)} keyboardType="number-pad" maxLength={4} editable={!busy} error={errors.days} hint="Yeni tanımlamalar için geçerlidir; müşterilerdeki mevcut bitiş tarihleri değişmez." />
    <View style={styles.line}><Text style={styles.label}>Yeni tanımlamalara açık</Text><Switch accessibilityLabel="Paket aktif" value={active} disabled={busy} onValueChange={(value) => { setActive(value); onDirty(); }} trackColor={{ true: theme.colors.primary }} /></View>
    <AppButton label={template ? "Paket bilgilerini kaydet" : "Paketi oluştur"} busy={busy} onPress={submit} />
  </View>;
}

function AssignForm({ template, busy, onSave, onDirty }: { template: PackageTemplate; busy: boolean; onSave: (values: PackageWrite) => void; onDirty: () => void }) {
  const [customer, setCustomer] = useState<PackageChoice | null>(null); const [id, setId] = useState(() => randomUUID());
  return <View style={styles.group}>
    <View style={styles.info}><Text style={styles.label}>{template.name}</Text><Text style={styles.note}>{template.sessionCount} yeni seans · {template.validityDays} gün · {template.serviceName ?? "Tüm hizmetler"}</Text><Text style={styles.note}>Tanımlama yeni bir bakiye ekler; önceki paketleri değiştirmez. Bu işlem ödeme almaz.</Text></View>
    {customer ? <><Text style={styles.label}>Seçili müşteri: {customer.name}</Text><AppButton label="Paket müşterisini değiştir" variant="ghost" disabled={busy} onPress={() => { setCustomer(null); setId(randomUUID()); onDirty(); }} /></> : <ChoicePicker mode="customers" busy={busy} onSelect={(row) => { setCustomer(row); setId(randomUUID()); onDirty(); }} />}
    <AppButton label="Müşteriye paketi tanımla" disabled={!customer} busy={busy} onPress={() => { if (!customer || busy) return; Alert.alert("Yeni seans paketi tanımla", `${customer.name} için ${template.name} eklenecek. Kalan seanslar tamamlanan randevularda mevcut sistem tarafından düşülür.`, [{ text: "Vazgeç", style: "cancel" }, { text: "Tanımla", onPress: () => onSave({ action: "assign", id, packageId: template.id, customerId: customer.id }) }]); }} />
  </View>;
}

export function PackageManager({ onClose }: { onClose: () => void }) {
  const { session, user, scope } = useManagement(); const client = useQueryClient(); const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<"templates" | "assignments">("templates"); const [search, setSearch] = useState(""); const q = useSearch(search);
  const [form, setForm] = useState<{ kind: "create" } | { kind: "update" | "assign"; template: PackageTemplate } | null>(null); const [dirty, setDirty] = useState(false); const [success, setSuccess] = useState("");
  const query = useInfiniteQuery({ queryKey: ["business-packages", user?.id, scope, tab, q], initialPageParam: 0, queryFn: ({ pageParam, signal }) => getPackagePage<PackageTemplate | PackageGrant>(session!.access_token, scope, tab, q, pageParam, signal), getNextPageParam: (last, pages) => last.hasMore ? pages.length * 25 : undefined, enabled: Boolean(session && scope.businessId), retry: false });
  const mutation = useMutation({ mutationFn: (values: PackageWrite) => savePackage(session!.access_token, scope, values), retry: false, onSuccess: async (_, values) => {
    setDirty(false); setForm(null); setSuccess(values.action === "assign" ? "Paket müşteriye tanımlandı." : "Paket kaydedildi.");
    await Promise.all([client.invalidateQueries({ queryKey: ["business-packages", user?.id] }), client.invalidateQueries({ queryKey: ["business-panel"] })]);
  } });
  const busy = mutation.isPending;
  const leave = (callback: () => void) => { if (busy) return; if (!dirty) callback(); else Alert.alert("Değişiklikler kaydedilmedi", "Girdiğin bilgileri bırakmak istiyor musun?", [{ text: "Devam et", style: "cancel" }, { text: "Değişiklikleri bırak", style: "destructive", onPress: () => { setDirty(false); callback(); } }]); };
  const open = (next: NonNullable<typeof form>) => { setForm(next); setDirty(false); setSuccess(""); mutation.reset(); };
  const save = (values: PackageWrite) => { if (!busy) mutation.mutate(values); };
  return <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={() => leave(onClose)}>
    <KeyboardAvoidingView style={[styles.screen, { paddingTop: Math.max(16, insets.top) }]} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.header}><Package size={23} color={theme.colors.primary} /><View style={{ flex: 1 }}><Text style={styles.heading}>{form?.kind === "create" ? "Yeni seans paketi" : form?.kind === "update" ? "Paket bilgileri" : form?.kind === "assign" ? "Müşteriye paket tanımla" : "Paketler ve seanslar"}</Text><Text style={styles.note}>İşletmenin tüm şubelerinde ortak</Text></View><Pressable style={styles.close} accessibilityRole="button" accessibilityLabel="Paket ekranını kapat" disabled={busy} onPress={() => leave(onClose)}><X size={23} color={theme.colors.text} /></Pressable></View>
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: 32 + insets.bottom }]} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        {mutation.error ? <Text accessibilityRole="alert" style={styles.error}>{mutation.error.message}</Text> : null}
        {success ? <Text accessibilityRole="alert" style={styles.success}>{success}</Text> : null}
        {form ? <>
          <AppButton label="Paket listesine dön" variant="ghost" disabled={busy} onPress={() => leave(() => { setForm(null); mutation.reset(); })} />
          {form.kind === "assign" ? <AssignForm key={form.template.id} template={form.template} busy={busy} onSave={save} onDirty={() => setDirty(true)} /> : <TemplateForm key={form.kind === "update" ? form.template.id : "new"} template={form.kind === "update" ? form.template : undefined} busy={busy} onSave={save} onDirty={() => setDirty(true)} />}
        </> : <>
          <View style={styles.wrap}><Chip label="Paket şablonları" selected={tab === "templates"} onPress={() => { setTab("templates"); setSearch(""); }} /><Chip label="Müşteri seansları" selected={tab === "assignments"} onPress={() => { setTab("assignments"); setSearch(""); }} /></View>
          <FormField label={tab === "templates" ? "Paket ara" : "Seanslarda müşteri ara"} placeholder="Adı yaz" value={search} onChangeText={setSearch} maxLength={120} />
          {tab === "templates" ? <AppButton label="Yeni seans paketi" disabled={!query.data || Boolean(query.error)} onPress={() => open({ kind: "create" })} /> : <View style={styles.info}><Text style={styles.note}>Kalan seans kayıtlı bakiyedir. Başlangıç bakiyesi eski kayıtlarda saklanmadığı için kullanılan seans sayısı tahmin edilmez. Tamamlanan uygun randevular mevcut sistemde seans düşer; bu ekranda bakiye elle değiştirilmez.</Text></View>}
          {query.isPending ? <LoadingState label="Paketler yükleniyor..." /> : null}
          {query.error ? <><Text accessibilityRole="alert" style={styles.error}>{query.error.message}</Text><AppButton label="Paketleri yeniden yükle" onPress={() => void query.refetch()} /></> : null}
          {query.data?.pages.flatMap((page) => page.rows).map((row) => "sessionCount" in row ? <View key={row.id} style={styles.card}><Text style={styles.heading}>{row.name}</Text><Text style={styles.note}>{row.sessionCount} seans · {row.validityDays} gün · {row.serviceName ?? "Tüm hizmetler"}</Text><Text style={styles.note}>{row.active ? "Yeni tanımlamalara açık" : "Yeni tanımlamalara kapalı"}</Text><AppButton label="Paket bilgilerini düzenle" variant="secondary" onPress={() => open({ kind: "update", template: row })} /><AppButton label="Müşteriye tanımla" disabled={!row.active} onPress={() => open({ kind: "assign", template: row })} /></View> : <View key={row.id} style={styles.card}><Text style={styles.heading}>{row.customerName}</Text><Text style={styles.label}>{row.packageName}</Text><Text style={styles.balance}>{row.remainingSessions} seans kaldı</Text><Text style={styles.note}>Son geçerlilik: {new Date(row.expiresAt).toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul" })}</Text><Text style={styles.note}>{row.expired ? "Süresi doldu · randevuda kullanılamaz" : row.remainingSessions === 0 ? "Seanslar tükendi" : "Kullanılabilir"}</Text></View>)}
          {query.data && !query.data.pages[0].rows.length ? <Text style={styles.note}>{q ? "Aramana uygun kayıt yok." : tab === "templates" ? "Henüz seans paketi eklenmemiş." : "Henüz müşteriye paket tanımlanmamış."}</Text> : null}
          {query.hasNextPage ? <AppButton label="Daha fazla paket kaydı" variant="secondary" busy={query.isFetchingNextPage} onPress={() => void query.fetchNextPage()} /> : null}
        </>}
      </ScrollView>
    </KeyboardAvoidingView>
  </Modal>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F8F8FA" }, header: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 20, paddingVertical: 14, backgroundColor: theme.colors.surface }, close: { minHeight: 44, minWidth: 44, alignItems: "center", justifyContent: "center" },
  heading: { color: theme.colors.text, fontSize: 19, lineHeight: 27, fontWeight: theme.typography.weight.semibold }, label: { color: theme.colors.text, fontSize: 14, lineHeight: 21, fontWeight: theme.typography.weight.medium }, note: { color: theme.colors.muted, fontSize: 13, lineHeight: 21 },
  body: { padding: 20, gap: 16 }, group: { gap: 16 }, wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, line: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }, card: { padding: 16, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 16, backgroundColor: theme.colors.surface, gap: 12 }, info: { padding: 14, borderRadius: 12, backgroundColor: theme.colors.primarySoft, gap: 8 }, balance: { color: theme.colors.primary, fontSize: 21, fontWeight: theme.typography.weight.medium }, error: { color: theme.colors.danger, fontSize: 14, lineHeight: 21 }, success: { color: theme.colors.success, fontSize: 14, lineHeight: 21 },
});
