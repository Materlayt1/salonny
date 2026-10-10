import { useRef, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { randomUUID } from "expo-crypto";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { X, CheckCircle2 } from "lucide-react-native";
import { AppButton, Chip, LoadingState } from "@/components/app-ui";
import { useManagement } from "@/providers/management-provider";
import { getBookingChoices, getStaffAvailability, createStaffBooking, type BookingChoice, type StaffBooking } from "@/lib/business-booking";
import { ApiError } from "@/lib/api";
import { theme } from "@/constants/theme";

const steps = ["Müşteri", "Hizmet ve çalışan", "Tarih ve saat", "Onay"];
const dateInZone = (date: Date, timezone: string) => new Intl.DateTimeFormat("sv-SE", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
const money = (minor: number, currency = "TRY") => new Intl.NumberFormat("tr-TR", { style: "currency", currency }).format(minor / 100);
function ChoicePicker({ kind, selected, onChoose, serviceId, disabled }: { kind: "customers" | "services" | "employees"; selected: BookingChoice | null; onChoose: (row: BookingChoice) => void; serviceId?: string; disabled: boolean }) {
  const { session, user, scope } = useManagement(); const [q, setQ] = useState(""); const [search, setSearch] = useState("");
  const query = useInfiniteQuery({ queryKey: ["business-booking-choices", user?.id, scope, kind, search, serviceId], initialPageParam: 0, queryFn: ({ pageParam, signal }) => getBookingChoices(session!.access_token, scope, kind, pageParam, search, serviceId, signal), getNextPageParam: (last, pages) => last.hasMore ? pages.length * 50 : undefined, enabled: Boolean(session && scope.businessId && (kind !== "employees" || serviceId)), retry: false });
  const label = { customers: "Müşteri", services: "Hizmet", employees: "Çalışan" }[kind];
  return <View style={styles.group}>
    <Text style={styles.label}>{label} seç</Text>
    <View style={styles.line}><TextInput accessibilityLabel={`${label} araması`} value={q} onChangeText={setQ} editable={!disabled} maxLength={100} placeholder={`${label} adı ara`} returnKeyType="search" onSubmitEditing={() => setSearch(q.trim())} style={[styles.input, { flex: 1 }]} /><AppButton label={`${label} ara`} variant="secondary" disabled={disabled} onPress={() => setSearch(q.trim())} /></View>
    {query.isPending ? <LoadingState label={`${label} seçenekleri yükleniyor...`} /> : null}
    {query.isError ? <><Text accessibilityRole="alert" style={styles.error}>{query.error.message}</Text><AppButton label={`${label} seçeneklerini yeniden yükle`} variant="secondary" onPress={() => void query.refetch()} /></> : null}
    {query.data?.pages.flatMap((page) => page.rows).map((row) => <Pressable key={row.id} accessibilityRole="button" accessibilityLabel={`${label} seç: ${row.title}`} accessibilityState={{ selected: selected?.id === row.id }} disabled={disabled} onPress={() => onChoose(row)} style={[styles.choice, selected?.id === row.id && styles.chosen]}><View style={{ flex: 1 }}><Text style={styles.label}>{row.title}</Text>{row.subtitle ? <Text style={styles.note}>{row.subtitle}</Text> : null}{row.priceMinor !== undefined ? <Text style={styles.note}>{row.durationMinutes} dk · {money(row.priceMinor, row.currency)} · Çalışana göre değişebilir</Text> : null}</View>{selected?.id === row.id ? <CheckCircle2 size={22} color={theme.colors.primary} /> : null}</Pressable>)}
    {query.isSuccess && !query.data.pages[0].rows.length ? <Text style={styles.note}>{kind === "customers" ? "Müşteri bulunamadı. Önce Müşteriler bölümünden müşteri kaydı ekle." : kind === "services" ? "Bu şubede randevuya açık hizmet bulunamadı." : "Bu hizmeti veren aktif şube çalışanı bulunamadı. Çalışan yetkinliklerini kontrol et."}</Text> : null}
    {query.hasNextPage ? <AppButton label={`Daha fazla ${label.toLocaleLowerCase("tr-TR")}`} variant="secondary" busy={query.isFetchingNextPage} disabled={disabled} onPress={() => void query.fetchNextPage()} /> : null}
  </View>;
}
export function BusinessBookingEditor({ onClose, onSaved }: { onClose: () => void; onSaved?: (id: string) => void | Promise<void> }) {
  const { session, user, scope, context } = useManagement(); const client = useQueryClient();
  const [step, setStep] = useState(0); const [customer, setCustomer] = useState<BookingChoice | null>(null); const [service, setService] = useState<BookingChoice | null>(null); const [employee, setEmployee] = useState<BookingChoice | null>(null); const [slot, setSlot] = useState("");
  const [date, setDate] = useState(() => dateInZone(new Date(), "Europe/Istanbul")); const [selectedDate, setSelectedDate] = useState(date); const [dateError, setDateError] = useState(""); const [savedId, setSavedId] = useState("");
  const [key, setKey] = useState(() => randomUUID()); const [attemptedKey, setAttemptedKey] = useState<string | null>(null);
  const [openedAt] = useState(() => Date.now()); const submitting = useRef(false);
  const availability = useQuery({ queryKey: ["business-staff-availability", user?.id, scope, service?.id, employee?.id, selectedDate], queryFn: ({ signal }) => getStaffAvailability(session!.access_token, scope, service!.id, employee!.id, selectedDate, signal), enabled: Boolean(session && scope.businessId && service && employee && step >= 2), retry: false });
  const timezone = availability.data?.timezone ?? "Europe/Istanbul";
  const mutation = useMutation({ mutationFn: (values: StaffBooking) => createStaffBooking(session!.access_token, scope, values), retry: false, onSuccess: async (result) => {
    setSavedId(result.id);
    await Promise.all([client.invalidateQueries({ queryKey: ["business-panel"] }), client.invalidateQueries({ queryKey: ["business-staff-availability"] }), client.invalidateQueries({ queryKey: ["appointments"] })]);
    await onSaved?.(result.id);
  }, onError: (error) => {
    if (error instanceof ApiError && error.status === 409) { setSlot(""); setStep(2); void availability.refetch(); }
  }, onSettled: () => { submitting.current = false; } });
  const busy = mutation.isPending;
  const change = () => { setKey(randomUUID()); setAttemptedKey(null); mutation.reset(); };
  const applyDate = (value: string) => {
    const parsed = new Date(`${value}T12:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) { setDateError("Geçerli tarihi YIL-AY-GÜN biçiminde gir."); return; }
    setDateError(""); setDate(value); setSelectedDate(value); setSlot(""); change();
  };
  const dates = Array.from({ length: 7 }, (_, index) => dateInZone(new Date(openedAt + index * 86_400_000), timezone));
  const close = () => { if (!busy) onClose(); };
  const freshSlot = availability.isSuccess && !availability.isFetching && availability.data.slots.includes(slot);
  const nextAllowed = step === 0 ? Boolean(customer) : step === 1 ? Boolean(service && employee) : step === 2 ? Boolean(slot && freshSlot && !dateError) : false;
  // After an uncertain response the exact original payload remains retryable,
  // even when its already-created appointment has disappeared from free slots.
  const canSubmit = Boolean(customer && service && employee && slot && (freshSlot || attemptedKey === key));
  const submit = () => {
    if (!session || !canSubmit || busy || submitting.current) return;
    submitting.current = true; setAttemptedKey(key);
    mutation.mutate({ customerId: customer!.id, serviceId: service!.id, employeeId: employee!.id, startsAt: slot, idempotencyKey: key });
  };
  const summary = <View style={styles.card}><Text style={styles.label}>{customer?.title ?? "Müşteri seçilmedi"}</Text><Text style={styles.note}>{service?.title ?? "Hizmet seçilmedi"}{employee ? ` · ${employee.title}` : ""}</Text>{slot ? <Text style={styles.note}>{new Date(slot).toLocaleString("tr-TR", { timeZone: timezone })}</Text> : null}{availability.data ? <Text style={styles.price}>{availability.data.quote.durationMinutes} dk · {money(availability.data.quote.priceMinor, availability.data.quote.currency)}</Text> : null}</View>;
  return <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
    <SafeAreaView style={styles.screen} edges={["top", "bottom", "left", "right"]}><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.header}><View style={{ flex: 1 }}><Text style={styles.heading}>İşletme adına randevu</Text><Text style={styles.note}>{context.data?.business.name} · {context.data?.branch.name}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Randevu editörünü kapat" disabled={busy} onPress={close} style={styles.close}><X size={24} color={theme.colors.text} /></Pressable></View>
      {savedId ? <View style={styles.success}><CheckCircle2 size={48} color={theme.colors.primary} /><Text accessibilityRole="alert" style={styles.heading}>Randevu oluşturuldu</Text><Text style={styles.note}>Randevu seçili şubenin takvimine onaylı olarak eklendi.</Text>{summary}<AppButton label="Tamam" onPress={onClose} /></View> : <>
        <View style={styles.progress}><Text style={styles.label}>Adım {step + 1} / 4 · {steps[step]}</Text><View style={styles.line}>{steps.map((_, index) => <View key={index} style={[styles.bar, index <= step && { backgroundColor: theme.colors.primary }]} />)}</View></View>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {mutation.error ? <Text accessibilityRole="alert" style={styles.error}>{mutation.error.message}{mutation.error instanceof ApiError && mutation.error.status !== 409 ? " Yanıt alınamadıysa aynı seçimlerle tekrar denemek yeni bir randevu oluşturmaz." : ""}</Text> : null}
          {step === 0 ? <><Text style={styles.note}>Telefonla veya salonda randevu isteyen kayıtlı müşterin için oluştur. Müşteri hesabı ve senin hesabın birbirine bağlanmaz.</Text><ChoicePicker kind="customers" selected={customer} disabled={busy} onChoose={(row) => { setCustomer(row); change(); }} /></> : null}
          {step === 1 ? <><ChoicePicker kind="services" selected={service} disabled={busy} onChoose={(row) => { setService(row); setEmployee(null); setSlot(""); change(); }} />{service ? <ChoicePicker key={service.id} kind="employees" selected={employee} serviceId={service.id} disabled={busy} onChoose={(row) => { setEmployee(row); setSlot(""); change(); }} /> : null}</> : null}
          {step === 2 ? <>
            <Text style={styles.note}>Saatler {timezone}. Çalışma saatleri, izinler, mola ve minimum bildirim süresi dikkate alınır. Kaynakların uygunluğu kaydederken tekrar doğrulanır.</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.line}>
              {dates.map((value) => <Chip key={value} label={value} selected={selectedDate === value} onPress={() => { if (!busy) applyDate(value); }} />)}
            </ScrollView>
            <Text style={styles.label}>Başka bir tarih</Text>
            <View style={styles.line}>
              <TextInput accessibilityLabel="İşletme randevu tarihi" style={[styles.input, { flex: 1 }]} value={date} onChangeText={setDate} editable={!busy} maxLength={10} placeholder="YIL-AY-GÜN" />
              <AppButton label="Saatleri getir" variant="secondary" disabled={busy} onPress={() => applyDate(date.trim())} />
            </View>
            {dateError ? <Text accessibilityRole="alert" style={styles.error}>{dateError}</Text> : null}
            {availability.isPending ? <LoadingState label="Uygun saatler yükleniyor..." /> : null}
            {availability.isError ? <><Text accessibilityRole="alert" style={styles.error}>{availability.error.message}</Text><AppButton label="Saatleri yeniden yükle" variant="secondary" onPress={() => void availability.refetch()} /></> : null}
            <View style={styles.wrap}>{availability.data?.slots.map((value) => <Chip key={value} label={new Date(value).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: timezone })} selected={slot === value} onPress={() => { if (!busy) { setSlot(value); change(); } }} />)}</View>
            {availability.isSuccess && !availability.data.slots.length ? <Text style={styles.note}>Bu tarihte uygun saat yok. Başka tarih veya çalışan seç.</Text> : null}
          </> : null}
          {step === 3 ? <><Text style={styles.heading}>Bilgileri kontrol et</Text>{summary}<Text style={styles.note}>Tek kişilik, tek hizmetlik onaylı randevu oluşturulacak. Hizmet tutarı sunucuda güncel fiyatla hesaplanır; burada online ödeme alınmaz.</Text>{!canSubmit ? <><Text accessibilityRole="alert" style={styles.error}>Saatin uygunluğu değişti veya doğrulanamadı. Uygun saatleri tekrar kontrol et.</Text><AppButton label="Uygun saatlere dön" variant="secondary" onPress={() => { setSlot(""); setStep(2); change(); void availability.refetch(); }} /></> : null}</> : null}
        </ScrollView>
        <View testID="staff-booking-footer" style={styles.footer}>{step > 0 ? <AppButton label="Önceki adım" variant="ghost" disabled={busy} onPress={() => setStep((value) => value - 1)} /> : null}<AppButton label={step === 3 ? "Randevuyu oluştur" : "Devam"} busy={busy} disabled={step === 3 ? !canSubmit : !nextAllowed} onPress={() => { if (busy) return; if (step === 3) submit(); else setStep((value) => value + 1); }} style={{ flex: 1 }} /></View>
      </>}
    </KeyboardAvoidingView></SafeAreaView>
  </Modal>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background, paddingTop: 20 }, header: { flexDirection: "row", alignItems: "center", padding: 20, gap: 12, backgroundColor: theme.colors.surface }, close: { minHeight: 44, minWidth: 44, alignItems: "center", justifyContent: "center" }, heading: { color: theme.colors.text, fontSize: 20, fontWeight: theme.typography.weight.semibold, lineHeight: 28 }, label: { color: theme.colors.text, fontSize: 15, lineHeight: 22, fontWeight: theme.typography.weight.medium }, note: { color: theme.colors.muted, fontSize: 14, lineHeight: 22 }, body: { padding: 20, paddingBottom: 32, gap: 18 }, group: { gap: 12 }, line: { flexDirection: "row", alignItems: "center", gap: 8 }, wrap: { flexDirection: "row", flexWrap: "wrap", gap: 10 }, input: { borderColor: theme.colors.border, borderWidth: 1, borderRadius: 12, padding: 12, minHeight: 50, color: theme.colors.text, fontSize: 15 }, choice: { borderColor: theme.colors.border, borderWidth: 1, backgroundColor: theme.colors.surface, borderRadius: 14, padding: 16, minHeight: 64, flexDirection: "row", alignItems: "center", gap: 12 }, chosen: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primarySoft }, card: { padding: 18, borderRadius: 16, backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderWidth: 1, gap: 8 }, price: { color: theme.colors.primaryDark, fontSize: 17, fontWeight: theme.typography.weight.semibold, lineHeight: 24 }, progress: { gap: 10, paddingHorizontal: 20, paddingVertical: 14 }, bar: { height: 4, flex: 1, borderRadius: 2, backgroundColor: theme.colors.border }, footer: { flexDirection: "row", padding: 16, paddingBottom: 24, borderTopWidth: 1, borderColor: theme.colors.border, gap: 10, backgroundColor: theme.colors.surface }, error: { color: theme.colors.danger, fontSize: 14, lineHeight: 22 }, success: { flex: 1, padding: 24, gap: 18, justifyContent: "center" },
});
