import { useState } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { X, CalendarClock, Scissors, CalendarOff } from "lucide-react-native";
import { AppButton, Chip, LoadingState } from "@/components/app-ui";
import { useManagement } from "@/providers/management-provider";
import { getTeamPage, saveTeam, type PanelRow, type TeamPeriod } from "@/lib/management";
import { istanbulInputToIso } from "@/lib/local-time";
import { Alert } from "@/lib/alert";
import { theme } from "@/constants/theme";

const days = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];
const kinds = { leave: "İzin", vacation: "Tatil", blocked: "Bloklu zaman", break: "Mola" } as const;
function WeeklyEditor({ periods, locked, busy, onSave }: { periods: TeamPeriod[]; locked: boolean; busy: boolean; onSave: (values: Record<string, unknown>) => void }) {
  const [rows, setRows] = useState(() => days.map((_, weekday) => { const row = periods.find((item) => item.weekday === weekday); return { weekday, enabled: Boolean(row), startsAt: row?.startsAt ?? "09:00", endsAt: row?.endsAt ?? "19:00" }; }));
  const [error, setError] = useState("");
  const update = (weekday: number, patch: Partial<typeof rows[number]>) => setRows((prev) => prev.map((row) => row.weekday === weekday ? { ...row, ...patch } : row));
  const submit = () => {
    const selected = rows.filter((row) => row.enabled).map(({ weekday, startsAt, endsAt }) => ({ weekday, startsAt, endsAt }));
    if (selected.some((row) => !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(row.startsAt) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(row.endsAt) || row.startsAt >= row.endsAt)) { setError("Saatleri SS:DD biçiminde gir; bitiş başlangıçtan sonra olmalı."); return; }
    setError("");
    if (!selected.length) Alert.alert("İşletme saatlerine dön", "Özel vardiya kaldırılacak. Çalışan işletmenin çalışma saatlerini kullanacak; tüm haftayı kapatmak için izin/blok ekle.", [{ text: "Vazgeç", style: "cancel" }, { text: "Onayla", onPress: () => onSave({ action: "schedule", periods: [] }) }]);
    else onSave({ action: "schedule", periods: selected });
  };
  return <View style={styles.group}>
    <Text style={styles.note}>Saatler İstanbul saatidir. Vardiya seçili şubeye aittir. Özel vardiya olmayan günlerde işletme saatleri kullanılır; günü kapatmak için izin/blok ekle.</Text>
    {locked ? <Text accessibilityRole="alert" style={styles.error}>Tarihe özel veya çok parçalı vardiyalar var. Mevcut kayıtların silinmemesi için haftalık düzenleme kapalı.</Text> : null}
    {rows.map((row) => <View key={row.weekday} style={styles.card}>
      <View style={styles.line}><Text style={styles.label}>{days[row.weekday]}</Text><Switch accessibilityLabel={`${days[row.weekday]} vardiyası`} value={row.enabled} disabled={busy || locked} onValueChange={(enabled) => update(row.weekday, { enabled })} trackColor={{ true: theme.colors.primary }} /></View>
      {row.enabled ? <View style={styles.line}><TextInput editable={!busy && !locked} accessibilityLabel={`${days[row.weekday]} başlangıç`} value={row.startsAt} onChangeText={(startsAt) => update(row.weekday, { startsAt })} placeholder="09:00" maxLength={5} keyboardType="numbers-and-punctuation" style={[styles.input, styles.clock]} /><Text style={styles.note}>—</Text><TextInput editable={!busy && !locked} accessibilityLabel={`${days[row.weekday]} bitiş`} value={row.endsAt} onChangeText={(endsAt) => update(row.weekday, { endsAt })} placeholder="19:00" maxLength={5} keyboardType="numbers-and-punctuation" style={[styles.input, styles.clock]} /></View> : <Text style={styles.note}>Özel vardiya yok</Text>}
    </View>)}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    <AppButton label="Vardiyayı kaydet" busy={busy} disabled={locked} onPress={submit} />
  </View>;
}
function TimeOffForm({ busy, onSave }: { busy: boolean; onSave: (values: Record<string, unknown>) => void }) {
  const [start, setStart] = useState(""); const [end, setEnd] = useState(""); const [note, setNote] = useState("");
  const [kind, setKind] = useState<keyof typeof kinds>("leave"); const [error, setError] = useState("");
  const submit = () => {
    const startsAt = istanbulInputToIso(start); const endsAt = istanbulInputToIso(end);
    if (!startsAt || !endsAt || endsAt <= startsAt || Date.parse(endsAt) - Date.parse(startsAt) > 366 * 86_400_000) { setError("Geçerli başlangıç ve sonraki bitişi YIL-AY-GÜN SS:DD biçiminde gir (en fazla 366 gün)."); return; }
    setError(""); onSave({ action: "timeOff", startsAt, endsAt, kind, note });
  };
  return <View style={styles.card}>
    <Text style={styles.heading}>Yeni izin veya blok</Text><Text style={styles.note}>İstanbul saati. Bu kayıt çalışanın tüm şubelerdeki müsaitliğini etkiler. Mevcut randevular kendiliğinden iptal edilmez.</Text>
    <View style={styles.wrap}>{Object.entries(kinds).map(([key, label]) => <Chip key={key} label={label} selected={kind === key} onPress={() => { if (!busy) setKind(key as keyof typeof kinds); }} />)}</View>
    <Text style={styles.label}>Başlangıç</Text><TextInput editable={!busy} accessibilityLabel="İzin başlangıcı" placeholder="2026-10-10 09:00" value={start} onChangeText={setStart} autoCapitalize="none" maxLength={16} style={styles.input} />
    <Text style={styles.label}>Bitiş</Text><TextInput editable={!busy} accessibilityLabel="İzin bitişi" placeholder="2026-10-10 18:00" value={end} onChangeText={setEnd} autoCapitalize="none" maxLength={16} style={styles.input} />
    <TextInput editable={!busy} accessibilityLabel="İzin notu" placeholder="İsteğe bağlı not" value={note} onChangeText={setNote} multiline maxLength={1000} style={styles.input} />
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    <AppButton label="İzni kaydet" busy={busy} onPress={submit} />
  </View>;
}
export function TeamManager({ employee, onClose }: { employee: PanelRow; onClose: () => void }) {
  const { session, user, scope } = useManagement(); const client = useQueryClient();
  const [tab, setTab] = useState<"services" | "schedule" | "leave">("services"); const [success, setSuccess] = useState(""); const [formVersion, setFormVersion] = useState(0);
  const query = useInfiniteQuery({ queryKey: ["business-team", user?.id, scope, employee.id], initialPageParam: 0, queryFn: ({ pageParam, signal }) => getTeamPage(session!.access_token, scope, employee.id, pageParam, signal), getNextPageParam: (last, pages) => last.hasMore ? pages.length * 50 : undefined, enabled: Boolean(session && scope.businessId), retry: false });
  const first = query.data?.pages[0];
  const mutation = useMutation({ mutationFn: (values: Record<string, unknown>) => saveTeam(session!.access_token, scope, employee.id, values), onSuccess: async (_, values) => {
    setSuccess("Kaydedildi.");
    await Promise.all([client.invalidateQueries({ queryKey: ["business-team", user?.id, scope, employee.id] }), client.invalidateQueries({ queryKey: ["business-panel"] }), client.invalidateQueries({ queryKey: ["business"] })]);
    if (values.action === "timeOff") setFormVersion((value) => value + 1);
  } });
  const save = (values: Record<string, unknown>) => { if (mutation.isPending) return; setSuccess(""); mutation.mutate(values); };
  const busy = mutation.isPending;
  const close = () => { if (!busy) onClose(); };
  return <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.header}><View style={{ flex: 1 }}><Text style={styles.heading}>{employee.title}</Text><Text style={styles.note}>Hizmetler ve müsaitlik</Text></View><Pressable disabled={busy} accessibilityRole="button" accessibilityLabel="Çalışan araçlarını kapat" onPress={close}><X size={24} color={theme.colors.text} /></Pressable></View>
      <View style={styles.tabs}>{[{ key: "services" as const, label: "Hizmetler", Icon: Scissors }, { key: "schedule" as const, label: "Vardiya", Icon: CalendarClock }, { key: "leave" as const, label: "İzinler", Icon: CalendarOff }].map(({ key, label, Icon }) => <Pressable key={key} accessibilityRole="button" accessibilityLabel={`Çalışan ${label.toLocaleLowerCase("tr-TR")}`} disabled={busy} onPress={() => { setTab(key); mutation.reset(); setSuccess(""); }} style={[styles.tab, tab === key && { backgroundColor: theme.colors.primarySoft }]}><Icon size={18} color={theme.colors.primary} /><Text style={styles.label}>{label}</Text></Pressable>)}</View>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {query.isPending ? <LoadingState label="Çalışan planı yükleniyor..." /> : null}
        {query.isError ? <><Text accessibilityRole="alert" style={styles.error}>{query.error.message}</Text><AppButton label="Yeniden dene" onPress={() => void query.refetch()} /></> : null}
        {mutation.error ? <Text accessibilityRole="alert" style={styles.error}>{mutation.error.message}</Text> : null}
        {success ? <Text accessibilityRole="alert" style={styles.success}>{success}</Text> : null}
        {first && tab === "services" ? <><Text style={styles.note}>Hizmet yetkinliği tüm şubelerde ortaktır. Her seçim anında kaydedilir; diğer hizmetler ve özel fiyatlar korunur.</Text>{query.data!.pages.flatMap((page) => page.services).map((service) => <View key={service.id} style={[styles.card, styles.line]}><View style={{ flex: 1 }}><Text style={styles.label}>{service.name}</Text>{!service.active ? <Text style={styles.note}>Pasif hizmet</Text> : null}</View><Switch accessibilityLabel={`${service.name} yetkinliği`} value={service.assigned} disabled={busy || (!service.active && !service.assigned)} onValueChange={(assigned) => save({ action: "service", serviceId: service.id, assigned })} trackColor={{ true: theme.colors.primary }} /></View>)}{!first.services.length ? <Text style={styles.note}>Henüz hizmet eklenmemiş.</Text> : null}</> : null}
        {first && tab === "schedule" ? <WeeklyEditor periods={first.periods} locked={first.hasAdvancedSchedule} busy={busy} onSave={save} /> : null}
        {first && tab === "leave" ? <><TimeOffForm key={formVersion} busy={busy} onSave={save} /><Text style={styles.heading}>Güncel izin ve bloklar</Text>{query.data!.pages.flatMap((page) => page.timeOff).map((record) => <View key={record.id} style={styles.card}><Text style={styles.label}>{kinds[record.kind]}</Text><Text style={styles.note}>{new Date(record.startsAt).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" })} — {new Date(record.endsAt).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" })}</Text>{record.note ? <Text style={styles.note}>{record.note}</Text> : null}<AppButton label="İzin kaydını kaldır" variant="ghost" disabled={busy} onPress={() => Alert.alert("İzin kaydını kaldır", "Bu kayıt kaldırılacak ve çalışan bu zaman aralığında yeniden müsait olabilir.", [{ text: "Vazgeç", style: "cancel" }, { text: "Kaldır", style: "destructive", onPress: () => save({ action: "removeTimeOff", id: record.id }) }])} /></View>)}{!first.timeOff.length ? <Text style={styles.note}>Güncel izin veya blok bulunmuyor.</Text> : null}</> : null}
        {first && tab !== "schedule" && query.hasNextPage ? <AppButton label="Daha fazla çalışan kaydı" variant="secondary" busy={query.isFetchingNextPage} disabled={busy} onPress={() => void query.fetchNextPage()} /> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  </Modal>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F8F8FA", paddingTop: 20 }, header: { flexDirection: "row", alignItems: "center", gap: 12, padding: 20, backgroundColor: "#fff" }, heading: { color: theme.colors.text, fontSize: 19, fontWeight: "700" }, note: { color: theme.colors.muted, fontSize: 12, lineHeight: 20 }, label: { color: theme.colors.text, fontSize: 13, fontWeight: "600" }, tabs: { flexDirection: "row", padding: 12, gap: 8, backgroundColor: "#fff" }, tab: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: "center", gap: 6 }, body: { padding: 20, gap: 14, paddingBottom: 48 }, group: { gap: 12 }, card: { backgroundColor: "#fff", borderRadius: 14, borderWidth: 1, borderColor: theme.colors.border, padding: 14, gap: 10 }, line: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }, wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, input: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 10, padding: 12, color: theme.colors.text, fontSize: 14 }, clock: { flex: 1, flexBasis: 0, minWidth: 0, textAlign: "center" }, error: { color: theme.colors.danger, fontSize: 13, lineHeight: 20 }, success: { color: theme.colors.success, fontSize: 13, fontWeight: "600" },
});
