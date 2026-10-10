import { useEffect, useRef, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { randomUUID } from "expo-crypto";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Clock3, X } from "lucide-react-native";
import { AppButton, Chip, LoadingState } from "@/components/app-ui";
import { FormField } from "@/components/form-field";
import { getBookingChoices, type BookingChoice } from "@/lib/business-booking";
import { ApiError } from "@/lib/api";
import { Alert } from "@/lib/alert";
import { getWaitlistEntry, getWaitlistOfferSlots, getWaitlistPage, saveWaitlist, waitlistInputToIso, waitlistLocalInput, type WaitlistEntry, type WaitlistStatus, type WaitlistWrite } from "@/lib/waitlist-management";
import { useManagement } from "@/providers/management-provider";
import { theme } from "@/constants/theme";

const statuses: Record<WaitlistStatus | "active" | "all", string> = { active: "Aktif kayıtlar", all: "Tümü", waiting: "Bekliyor", offered: "Teklif var", accepted: "Kabul edildi", expired: "Süresi doldu", cancelled: "İptal edildi" };
function useSearch(value: string) { const [result, setResult] = useState(value); useEffect(() => { const timer = setTimeout(() => setResult(value.trim()), 300); return () => clearTimeout(timer); }, [value]); return result; }
function ChoicePicker({ kind, selected, serviceId, busy, onSelect }: { kind: "customers" | "services" | "employees"; selected: BookingChoice | null; serviceId?: string; busy: boolean; onSelect: (row: BookingChoice) => void }) {
  const { session, user, scope } = useManagement(); const [search, setSearch] = useState(""); const q = useSearch(search);
  const label = { customers: "Müşteri", services: "Hizmet", employees: "Çalışan" }[kind];
  const query = useInfiniteQuery({ queryKey: ["business-waitlist-choices", user?.id, scope, kind, serviceId, q], initialPageParam: 0, queryFn: ({ pageParam, signal }) => getBookingChoices(session!.access_token, scope, kind, pageParam, q, serviceId, signal), getNextPageParam: (last, pages) => last.hasMore ? pages.length * 50 : undefined, enabled: Boolean(session && scope.businessId && (kind !== "employees" || serviceId)), retry: false });
  return <View style={styles.group}>
    <FormField label={`Bekleme listesinde ${label.toLocaleLowerCase("tr-TR")} ara`} value={search} onChangeText={setSearch} maxLength={100} editable={!busy} placeholder="Adı yaz" />
    {query.isPending ? <LoadingState label={`${label} seçenekleri yükleniyor...`} /> : null}
    {query.error ? <><Text accessibilityRole="alert" style={styles.error}>{query.error.message}</Text><AppButton label={`${label} seçeneklerini yeniden yükle`} variant="secondary" disabled={busy} onPress={() => void query.refetch()} /></> : null}
    {query.data?.pages.flatMap((page) => page.rows).map((row) => <Pressable key={row.id} accessibilityRole="button" accessibilityLabel={`Bekleme ${label.toLocaleLowerCase("tr-TR")} seç: ${row.title}`} accessibilityState={{ selected: selected?.id === row.id }} disabled={busy} onPress={() => onSelect(row)} style={[styles.choice, selected?.id === row.id && styles.selected]}><Text style={styles.label}>{row.title}</Text>{row.subtitle ? <Text style={styles.note}>{row.subtitle}</Text> : null}</Pressable>)}
    {query.isSuccess && !query.data.pages[0].rows.length ? <Text style={styles.note}>Seçili şubede eşleşen {label.toLocaleLowerCase("tr-TR")} bulunamadı.</Text> : null}
    {query.hasNextPage ? <AppButton label={`Daha fazla ${label.toLocaleLowerCase("tr-TR")} seçeneği`} variant="secondary" busy={query.isFetchingNextPage} disabled={busy} onPress={() => void query.fetchNextPage()} /> : null}
  </View>;
}

type FormProps = { entry?: WaitlistEntry; timezone: string; now: number; busy: boolean; blocked: boolean; onDirty: () => void; onSave: (values: WaitlistWrite) => void };
function WindowForm({ entry, timezone, busy, blocked, onDirty, onSave }: FormProps) {
  const [customer, setCustomer] = useState<BookingChoice | null>(entry ? { id: entry.customerId, title: entry.customerName } : null);
  const [service, setService] = useState<BookingChoice | null>(entry ? { id: entry.serviceId, title: entry.serviceName } : null);
  const [employee, setEmployee] = useState<BookingChoice | null>(entry?.employeeId ? { id: entry.employeeId, title: entry.employeeName ?? "Seçili çalışan" } : null);
  const [picking, setPicking] = useState<"customers" | "services" | "employees" | null>(entry ? null : "customers");
  const [from, setFrom] = useState(() => waitlistLocalInput(entry?.desiredFrom ?? new Date(Date.now() + 86_400_000), timezone));
  const [to, setTo] = useState(() => waitlistLocalInput(entry?.desiredTo ?? new Date(Date.now() + 2 * 86_400_000), timezone));
  const [priority, setPriority] = useState(String(entry?.priority ?? 100)); const [notes, setNotes] = useState(entry?.notes ?? "");
  const [key, setKey] = useState(() => randomUUID()); const [errors, setErrors] = useState<Record<string, string>>({});
  const changed = () => { setKey(randomUUID()); onDirty(); };
  const update = (setter: (value: string) => void, field: string, value: string) => { setter(value); changed(); setErrors((old) => ({ ...old, [field]: "" })); };
  const writable = !entry || entry.status === "waiting" && entry.partySize === 1;
  const locked = busy || !writable;
  const submit = () => {
    const next: Record<string, string> = {}; const desiredFrom = waitlistInputToIso(from, timezone); const desiredTo = waitlistInputToIso(to, timezone);
    if (!customer) next.customer = "Kayıtlı bir müşteri seç.";
    if (!service) next.service = "Şubede aktif bir hizmet seç.";
    if (!desiredFrom || Date.parse(desiredFrom) <= Date.now() || Date.parse(desiredFrom) > Date.now() + 180 * 86_400_000) next.from = "Önümüzdeki 180 gün içindeki başlangıcı YIL-AY-GÜN SS:DD biçiminde gir.";
    if (!desiredTo || !desiredFrom || Date.parse(desiredTo) <= Date.parse(desiredFrom) || Date.parse(desiredTo) > Date.now() + 180 * 86_400_000) next.to = "Bitiş başlangıçtan sonra ve önümüzdeki 180 gün içinde olmalı.";
    if (!/^\d+$/.test(priority) || Number(priority) > 1000) next.priority = "Öncelik 0–1000 arasında tam sayı olmalı.";
    setErrors(next); if (locked || blocked || Object.keys(next).length || !desiredFrom || !desiredTo || !customer || !service) return;
    const requestKey = entry ? `${key}_${entry.updatedAt.replace(/[^0-9]/g, "")}` : key;
    const shared = { employeeId: employee?.id ?? null, desiredFrom, desiredTo, priority: Number(priority), notes: notes.trim(), idempotencyKey: requestKey };
    onSave(entry ? { action: "update", id: entry.id, expectedUpdatedAt: entry.updatedAt, ...shared } : { action: "create", customerId: customer.id, serviceId: service.id, ...shared });
  };
  return <View style={styles.group}>
    {!writable ? <Text accessibilityRole="alert" style={styles.error}>Kayıt artık tek kişilik bekleyen durumda değil. Taslağın korunuyor; güncel kaydı listeden kontrol et.</Text> : null}
    {entry ? <View style={styles.info}><Text style={styles.heading}>{entry.customerName}</Text><Text style={styles.note}>{entry.serviceName} · Müşteri ve hizmet değişmez.</Text></View> : <>
      <Text style={styles.label}>Müşteri: {customer?.title ?? "Seçilmedi"}</Text>
      <AppButton label="Bekleme müşterisini seç" variant="secondary" disabled={locked} onPress={() => setPicking("customers")} />
      {picking === "customers" ? <ChoicePicker kind="customers" selected={customer} busy={locked} onSelect={(row) => { setCustomer(row); setPicking("services"); changed(); }} /> : null}
      <Text style={styles.label}>Hizmet: {service?.title ?? "Seçilmedi"}</Text>
      <AppButton label="Bekleme hizmetini seç" variant="secondary" disabled={locked} onPress={() => setPicking("services")} />
      {picking === "services" ? <ChoicePicker kind="services" selected={service} busy={locked} onSelect={(row) => { setService(row); setEmployee(null); setPicking(null); changed(); }} /> : null}
      {errors.customer ? <Text accessibilityRole="alert" style={styles.error}>{errors.customer}</Text> : null}{errors.service ? <Text accessibilityRole="alert" style={styles.error}>{errors.service}</Text> : null}
    </>}
    <Text style={styles.label}>Çalışan tercihi: {employee?.title ?? "Uygun olan herhangi bir çalışan"}</Text>
    <View style={styles.wrap}><AppButton label="Çalışan tercihi seç" variant="secondary" disabled={locked || !service} onPress={() => setPicking("employees")} /><AppButton label="Çalışan tercihini kaldır" variant="ghost" disabled={locked || !employee} onPress={() => { setEmployee(null); setPicking(null); changed(); }} /></View>
    {picking === "employees" && service ? <ChoicePicker key={service.id} kind="employees" serviceId={service.id} selected={employee} busy={locked} onSelect={(row) => { setEmployee(row); setPicking(null); changed(); }} /> : null}
    <Text style={styles.note}>Saat dilimi: {timezone}. Aralık tercih belirtir; randevu veya yer ayırma oluşturmaz.</Text>
    <FormField label="İstenen başlangıç" value={from} onChangeText={(value) => update(setFrom, "from", value)} editable={!locked} placeholder="YIL-AY-GÜN SS:DD" maxLength={16} error={errors.from} />
    <FormField label="İstenen bitiş" value={to} onChangeText={(value) => update(setTo, "to", value)} editable={!locked} placeholder="YIL-AY-GÜN SS:DD" maxLength={16} error={errors.to} />
    <FormField label="Bekleme önceliği" value={priority} onChangeText={(value) => update(setPriority, "priority", value)} editable={!locked} keyboardType="number-pad" maxLength={4} error={errors.priority} hint="0 en yüksek önceliktir; aynı öncelikte eski kayıt önce gelir." />
    <FormField label="Bekleme notu" value={notes} onChangeText={(value) => update(setNotes, "notes", value)} editable={!locked} multiline maxLength={1000} style={{ minHeight: 96, textAlignVertical: "top" }} />
    <AppButton label={entry ? "Bekleme kaydını güncelle" : "Bekleme kaydını ekle"} busy={busy} disabled={!writable || blocked} onPress={submit} />
  </View>;
}

function OfferForm({ entry, timezone, now, busy, blocked, onDirty, onSave }: FormProps & { entry: WaitlistEntry }) {
  const { session, user, scope } = useManagement();
  const [employee, setEmployee] = useState<BookingChoice | null>(entry.employeeId ? { id: entry.employeeId, title: entry.employeeName ?? "Seçili çalışan" } : null);
  const [picking, setPicking] = useState(!entry.employeeId);
  const [date, setDate] = useState(() => waitlistLocalInput(new Date(Math.max(Date.now(), Date.parse(entry.desiredFrom))), timezone).slice(0, 10));
  const [selectedDate, setSelectedDate] = useState(date); const [slot, setSlot] = useState(""); const [minutes, setMinutes] = useState("15");
  const [selectedVersion, setSelectedVersion] = useState("");
  const [key, setKey] = useState(() => randomUUID()); const [attemptedKey, setAttemptedKey] = useState<string | null>(null); const [error, setError] = useState("");
  const writable = entry.status === "waiting" && entry.partySize === 1 && Date.parse(entry.desiredTo) > now;
  const activeEmployee = entry.employeeId ? { id: entry.employeeId, title: entry.employeeName ?? "Seçili çalışan" } : employee;
  const query = useQuery({ queryKey: ["business-waitlist-slots", user?.id, scope, entry.id, entry.updatedAt, activeEmployee?.id, selectedDate], queryFn: ({ signal }) => getWaitlistOfferSlots(session!.access_token, scope, entry.id, activeEmployee!.id, selectedDate, signal), enabled: Boolean(session && activeEmployee && writable), retry: false });
  const change = () => { setKey(randomUUID()); setAttemptedKey(null); onDirty(); setError(""); };
  const applyDate = () => {
    const value = date.trim(); const instant = new Date(`${value}T12:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(instant.getTime()) || instant.toISOString().slice(0, 10) !== value) { setError("Geçerli tarihi YIL-AY-GÜN biçiminde gir."); return; }
    setSelectedDate(value); setSlot(""); change(); if (selectedDate === value) void query.refetch();
  };
  const dateApplied = date.trim() === selectedDate;
  const selectable = dateApplied && selectedVersion === entry.updatedAt && query.isSuccess && !query.isFetching && query.data.slots.includes(slot);
  const requestKey = `${key}_${entry.updatedAt.replace(/[^0-9]/g, "")}`;
  const canSubmit = !blocked && Boolean(activeEmployee && slot && (selectable && writable || attemptedKey === requestKey));
  const submit = () => {
    if (!/^\d+$/.test(minutes) || Number(minutes) < 5 || Number(minutes) > 120) { setError("Teklif süresi 5–120 dakika olmalı."); return; }
    if (!activeEmployee || busy || !canSubmit || error) return;
    setAttemptedKey(requestKey); onSave({ action: "prepareOffer", id: entry.id, employeeId: activeEmployee.id, startsAt: slot, offerMinutes: Number(minutes), expectedUpdatedAt: entry.updatedAt, idempotencyKey: requestKey });
  };
  return <View style={styles.group}>
    <View style={styles.info}><Text style={styles.heading}>{entry.customerName}</Text><Text style={styles.note}>{entry.serviceName}</Text><Text style={styles.note}>{waitlistLocalInput(entry.desiredFrom, timezone)} — {waitlistLocalInput(entry.desiredTo, timezone)}</Text></View>
    <Text style={styles.note}>Sadece tercih aralığındaki uygun saatler listelenir. Teklif saat için rezervasyon değildir. Müşteriyle ayrıca iletişime geçmelisin; bu ekran SMS veya e-posta göndermez.</Text>
    {!writable ? <Text accessibilityRole="alert" style={styles.error}>Kayıt artık teklif hazırlanabilecek durumda değil. Güncel durumu listeden kontrol et.</Text> : null}
    <Text style={styles.label}>Teklif çalışanı: {activeEmployee?.title ?? "Seçilmedi"}</Text>
    {entry.employeeId ? <Text style={styles.note}>Kayıttaki çalışan tercihi geçerlidir. Farklı çalışan için önce bekleme kaydını düzenle.</Text> : <AppButton label="Teklif çalışanını seç" variant="secondary" disabled={busy || !writable} onPress={() => setPicking((value) => !value)} />}
    {picking && !entry.employeeId ? <ChoicePicker kind="employees" serviceId={entry.serviceId} selected={employee} busy={busy || !writable} onSelect={(row) => { setEmployee(row); setSlot(""); setPicking(false); change(); }} /> : null}
    <FormField label="Teklif için tarih" value={date} onChangeText={(value) => { setDate(value); setSlot(""); change(); }} editable={!busy && writable} placeholder="YIL-AY-GÜN" maxLength={10} hint={`Saat dilimi: ${timezone}`} />
    <AppButton label="Teklif saatlerini getir" variant="secondary" disabled={busy || !activeEmployee || !writable} onPress={applyDate} />
    {query.isPending && activeEmployee && writable ? <LoadingState label="Teklif saatleri yükleniyor..." /> : null}
    {query.error ? <><Text accessibilityRole="alert" style={styles.error}>{query.error.message}</Text><AppButton label="Teklif saatlerini yenile" variant="secondary" disabled={busy} onPress={() => { setSlot(""); change(); void query.refetch(); }} /></> : null}
    {!dateApplied ? <Text style={styles.note}>Tarih değişti. Yeni tarihi uygulamak için teklif saatlerini getir.</Text> : null}
    <View style={styles.wrap}>{dateApplied ? query.data?.slots.map((value) => <Chip key={value} label={new Date(value).toLocaleTimeString("tr-TR", { timeZone: timezone, hour: "2-digit", minute: "2-digit" })} selected={slot === value && selectedVersion === entry.updatedAt} onPress={() => { if (!busy && !blocked && writable && !query.isFetching) { setSlot(value); setSelectedVersion(entry.updatedAt); change(); } }} />) : null}</View>
    {query.isSuccess && !query.data.slots.length ? <Text style={styles.note}>Bu tarihte tercih aralığına uyan uygun saat yok. Başka tarih veya çalışan seç.</Text> : null}
    <FormField label="Teklif geçerlilik süresi" value={minutes} onChangeText={(value) => { setMinutes(value); change(); }} editable={!busy && writable} keyboardType="number-pad" maxLength={3} hint="5–120 dakika; kayıt hazırlandığı anda başlar." />
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    <AppButton label="Teklifi hazırla" busy={busy} disabled={!canSubmit || Boolean(error)} onPress={submit} />
  </View>;
}

export function WaitlistManager({ onClose }: { onClose: () => void }) {
  const { session, user, scope, context } = useManagement(); const client = useQueryClient();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(timer); }, []);
  const [status, setStatus] = useState<WaitlistStatus | "active" | "all">("active"); const [search, setSearch] = useState(""); const q = useSearch(search);
  const [form, setForm] = useState<{ kind: "create" } | { kind: "update" | "offer"; entry: WaitlistEntry } | null>(null);
  const [dirty, setDirty] = useState(false); const [success, setSuccess] = useState(""); const [conflictId, setConflictId] = useState<string | null>(null); const [refreshing, setRefreshing] = useState(false); const [refreshError, setRefreshError] = useState("");
  const submitting = useRef(false); const cancelKeys = useRef(new Map<string, string>());
  const query = useInfiniteQuery({ queryKey: ["business-waitlist", user?.id, scope, status, q], initialPageParam: 0, queryFn: ({ pageParam, signal }) => getWaitlistPage(session!.access_token, scope, q, status, pageParam, signal), getNextPageParam: (last, pages) => last.hasMore ? pages.length * 25 : undefined, enabled: Boolean(session && scope.businessId), retry: false });
  const timezone = query.data?.pages[0].timezone ?? "Europe/Istanbul";
  const mutation = useMutation({ mutationFn: (values: WaitlistWrite) => saveWaitlist(session!.access_token, scope, values), retry: false, onSuccess: async (_, values) => {
    setForm(null); setDirty(false); setConflictId(null); setSuccess(values.action === "prepareOffer" ? "Teklif hazırlandı. Bildirim gönderilmedi ve randevu oluşturulmadı. Müşteriyle ayrıca iletişime geç." : values.action === "cancel" ? "Bekleme kaydı iptal edildi; geçmişi korundu." : "Bekleme kaydı kaydedildi.");
    await Promise.all([client.invalidateQueries({ queryKey: ["business-waitlist", user?.id] }), client.invalidateQueries({ queryKey: ["business-panel"] })]);
  }, onError: (error, values) => { if (error instanceof ApiError && error.status === 409 && values.action !== "create") setConflictId(values.id); }, onSettled: () => { submitting.current = false; } });
  const busy = mutation.isPending || refreshing;
  const save = (values: WaitlistWrite) => { if (busy || conflictId || submitting.current) return; submitting.current = true; mutation.mutate(values); };
  const onDirty = () => { setDirty(true); setSuccess(""); mutation.reset(); };
  const leave = (action: () => void) => { if (busy) return; if (!dirty) action(); else Alert.alert("Değişiklikler kaydedilmedi", "Taslağı bırakmak istiyor musun?", [{ text: "Devam et", style: "cancel" }, { text: "Taslağı bırak", style: "destructive", onPress: () => { setDirty(false); action(); } }]); };
  const open = (next: NonNullable<typeof form>) => { setForm(next); setDirty(false); setSuccess(""); setConflictId(null); setRefreshError(""); mutation.reset(); };
  const reloadEntry = async () => {
    if (!session || !conflictId || busy) return; setRefreshing(true); setRefreshError("");
    try {
      const response = await getWaitlistEntry(session.access_token, scope, conflictId);
      setForm((current) => current && current.kind !== "create" && current.entry.id === response.entry.id ? { ...current, entry: response.entry } : current);
      setConflictId(null); mutation.reset(); setSuccess("Güncel kayıt yüklendi. Taslağın korunuyor; durum ve seçimleri kontrol ederek yeniden dene.");
      await query.refetch();
    } catch (error) { setRefreshError(error instanceof Error ? error.message : "Güncel kayıt yüklenemedi."); } finally { setRefreshing(false); }
  };
  const cancel = (row: WaitlistEntry) => Alert.alert("Bekleme kaydını iptal et", `${row.customerName} kaydı iptal durumuna alınacak. Kayıt silinmez.`, [{ text: "Vazgeç", style: "cancel" }, { text: "İptal et", style: "destructive", onPress: () => { const signature = `${row.id}:${row.updatedAt}`; let key = cancelKeys.current.get(signature); if (!key) { key = randomUUID(); cancelKeys.current.set(signature, key); } save({ action: "cancel", id: row.id, expectedUpdatedAt: row.updatedAt, idempotencyKey: key }); } }]);
  return <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={() => leave(onClose)}>
    <SafeAreaView style={styles.screen} edges={["top", "bottom", "left", "right"]}><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.header}><Clock3 size={22} color={theme.colors.primary} /><View style={{ flex: 1 }}><Text style={styles.heading}>{form?.kind === "create" ? "Yeni bekleme kaydı" : form?.kind === "update" ? "Bekleme kaydını düzenle" : form?.kind === "offer" ? "Bekleme teklifi hazırla" : "Bekleme listesi"}</Text><Text style={styles.note}>{context.data?.business.name} · {context.data?.branch.name}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Bekleme listesini kapat" disabled={busy} onPress={() => leave(onClose)} style={styles.close}><X size={23} color={theme.colors.text} /></Pressable></View>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        {mutation.error ? <Text accessibilityRole="alert" style={styles.error}>{mutation.error.message} Yanıt belirsizse aynı taslakla tekrar dene; işlem anahtarı korunur.</Text> : null}
        {refreshError ? <Text accessibilityRole="alert" style={styles.error}>{refreshError}</Text> : null}
        {success ? <Text accessibilityRole="alert" style={styles.success}>{success}</Text> : null}
        {conflictId ? <View style={styles.info}><Text style={styles.note}>Kayıt veya uygun saat değişmiş olabilir. Taslağın silinmedi. Önce güncel kaydı yükle; eski bilgilerle başka kaydı değiştirme.</Text><AppButton label="Güncel bekleme kaydını yükle" variant="secondary" busy={refreshing} disabled={mutation.isPending} onPress={() => void reloadEntry()} /></View> : null}
        {form ? <>
          <AppButton label="Bekleme listesine dön" variant="ghost" disabled={busy} onPress={() => leave(() => { setForm(null); setConflictId(null); setSuccess(""); mutation.reset(); })} />
          {form.kind === "offer" ? <OfferForm key={`offer:${form.entry.id}`} entry={form.entry} timezone={timezone} now={now} busy={busy} blocked={Boolean(conflictId)} onSave={save} onDirty={onDirty} /> : <WindowForm key={form.kind === "create" ? "new" : form.entry.id} entry={form.kind === "update" ? form.entry : undefined} timezone={timezone} now={now} busy={busy} blocked={Boolean(conflictId)} onSave={save} onDirty={onDirty} />}
        </> : <>
          <View style={styles.info}><Text style={styles.note}>Bekleme kaydı randevu değildir. Teklif hazırlama müşteriye otomatik bildirim göndermez ve saati ayırmaz.</Text></View>
          <AppButton label="Yeni bekleme kaydı" disabled={!query.data || Boolean(query.error)} onPress={() => open({ kind: "create" })} />
          <FormField label="Bekleme listesinde müşteri ara" value={search} onChangeText={setSearch} maxLength={100} placeholder="Müşteri adı" />
          <View style={styles.wrap}>{(Object.keys(statuses) as Array<keyof typeof statuses>).map((value) => <Chip key={value} label={statuses[value]} selected={status === value} onPress={() => { if (!busy) { setStatus(value); mutation.reset(); setSuccess(""); } }} />)}</View>
          {query.isPending ? <LoadingState label="Bekleme kayıtları yükleniyor..." /> : null}
          {query.error ? <><Text accessibilityRole="alert" style={styles.error}>{query.error.message}</Text><AppButton label="Bekleme listesini yeniden yükle" variant="secondary" onPress={() => void query.refetch()} /></> : null}
          {query.data?.pages.flatMap((page) => page.rows).map((row) => <View key={row.id} style={styles.card}>
            <Text style={styles.heading}>{row.customerName}</Text><Text style={styles.label}>{row.serviceName}</Text><Text style={styles.note}>{statuses[row.status]} · Öncelik {row.priority}</Text>
            {row.customerPhone ? <Text selectable style={styles.note}>{row.customerPhone}</Text> : null}
            <Text style={styles.note}>{waitlistLocalInput(row.desiredFrom, timezone)} — {waitlistLocalInput(row.desiredTo, timezone)}</Text>
            <Text style={styles.note}>{row.employeeName ?? "Uygun olan herhangi bir çalışan"} · {timezone}</Text>
            {row.status === "waiting" && Date.parse(row.desiredTo) <= now ? <Text style={styles.error}>Talep tarih aralığı sona erdi. Yeni teklif için kaydı düzenleyip tarih aralığını yenile.</Text> : null}
            {row.notes ? <Text style={styles.note}>{row.notes}</Text> : null}
            {row.partySize !== 1 ? <Text style={styles.note}>Eski grup kaydı ({row.partySize} kişi): bu ekranda düzenleme veya teklif hazırlama desteklenmez.</Text> : null}
            {row.offeredStartsAt ? <Text style={styles.note}>Teklif saati: {waitlistLocalInput(row.offeredStartsAt, timezone)}{row.offerExpiresAt ? ` · Bitiş: ${waitlistLocalInput(row.offerExpiresAt, timezone)}` : ""}{row.offerExpired || row.status === "offered" && row.offerExpiresAt && Date.parse(row.offerExpiresAt) <= now ? " · Teklif süresi dolmuş" : ""}</Text> : null}
            {row.status === "waiting" && row.partySize === 1 ? <><AppButton label="Kaydı düzenle" accessibilityLabel={`Bekleme kaydını düzenle: ${row.customerName}`} variant="secondary" disabled={busy} onPress={() => open({ kind: "update", entry: row })} /><AppButton label="Teklif hazırla" accessibilityLabel={`Bekleme teklifi hazırla: ${row.customerName}`} disabled={busy || Date.parse(row.desiredTo) <= now} onPress={() => open({ kind: "offer", entry: row })} /></> : null}
            {row.status === "waiting" || row.status === "offered" ? <AppButton label="Kaydı iptal et" accessibilityLabel={`Bekleme kaydını iptal et: ${row.customerName}`} variant="danger" disabled={busy} onPress={() => cancel(row)} /> : null}
          </View>)}
          {query.isSuccess && !query.data.pages[0].rows.length ? <Text style={styles.note}>{q ? "Aramana uygun bekleme kaydı yok." : "Bu durum ve şube için bekleme kaydı bulunmuyor."}</Text> : null}
          {query.hasNextPage ? <AppButton label="Daha fazla bekleme kaydı" variant="secondary" busy={query.isFetchingNextPage} disabled={busy} onPress={() => void query.fetchNextPage()} /> : null}
        </>}
      </ScrollView>
    </KeyboardAvoidingView></SafeAreaView>
  </Modal>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F8F8FA" }, header: { flexDirection: "row", alignItems: "center", padding: 16, gap: 10, backgroundColor: theme.colors.surface }, close: { minHeight: 44, minWidth: 44, alignItems: "center", justifyContent: "center" },
  heading: { color: theme.colors.text, fontSize: 19, lineHeight: 27, fontWeight: theme.typography.weight.semibold }, label: { color: theme.colors.text, fontSize: 14, lineHeight: 21, fontWeight: theme.typography.weight.medium }, note: { color: theme.colors.muted, fontSize: 13, lineHeight: 21 },
  body: { padding: 16, paddingBottom: 32, gap: 16 }, group: { gap: 14 }, wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, choice: { padding: 14, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 12, backgroundColor: theme.colors.surface, gap: 5, minHeight: 50 }, selected: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primarySoft },
  card: { padding: 16, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 16, backgroundColor: theme.colors.surface, gap: 10 }, info: { padding: 14, borderRadius: 12, backgroundColor: theme.colors.primarySoft, gap: 8 }, error: { color: theme.colors.danger, fontSize: 14, lineHeight: 21 }, success: { color: theme.colors.success, fontSize: 14, lineHeight: 21 },
});
