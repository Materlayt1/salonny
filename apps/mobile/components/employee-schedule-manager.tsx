import { useRef, useState } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { randomUUID } from "expo-crypto";
import { CalendarClock, X } from "lucide-react-native";
import { AppButton, Chip, LoadingState } from "@/components/app-ui";
import { FormField } from "@/components/form-field";
import { theme } from "@/constants/theme";
import { Alert } from "@/lib/alert";
import { ApiError } from "@/lib/api";
import { employeeScheduleError, getEmployeeSchedulePage, periodSnapshot, saveEmployeeSchedule, validateScheduleValues, type EmployeePeriod, type EmployeeScheduleWrite, type ScheduleValues } from "@/lib/employee-schedule";
import type { PanelRow } from "@/lib/management";
import { useManagement } from "@/providers/management-provider";

const days = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];
type Editor = { period?: EmployeePeriod };

function PeriodForm({ employeeId, period, busy, onSave, onDirty }: { employeeId: string; period?: EmployeePeriod; busy: boolean; onSave: (values: EmployeeScheduleWrite) => void; onDirty: () => void }) {
  const [values, setValues] = useState<ScheduleValues>(() => period ? periodSnapshot(period) : { weekday: 0, startsAt: "09:00", endsAt: "12:00", validFrom: null, validUntil: null });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const createId = useRef<string | null>(null);
  const update = <K extends keyof ScheduleValues>(key: K, value: ScheduleValues[K]) => {
    setValues((old) => ({ ...old, [key]: value })); setErrors((old) => ({ ...old, [key]: "" })); onDirty();
  };
  const submit = () => {
    if (busy) return;
    const errors = validateScheduleValues(values); setErrors(errors);
    if (Object.keys(errors).length) return;
    if (period) onSave({ action: "updatePeriod", employeeId, id: period.id, expected: periodSnapshot(period), period: periodSnapshot(values) });
    else {
      // Keep the same UUID for double taps and uncertain network retries.
      createId.current ??= randomUUID();
      onSave({ action: "createPeriod", employeeId, id: createId.current, period: periodSnapshot(values) });
    }
  };
  return <View style={styles.group}>
    <Text style={styles.heading}>{period ? "Vardiya dönemini düzenle" : "Yeni vardiya dönemi"}</Text>
    <Text style={styles.note}>Bu kayıt seçili şubeye çalışma zamanı ekler. Tarih aralığı diğer vardiyaları değiştirmez veya geçersiz kılmaz. Mevcut randevular otomatik iptal edilmez.</Text>
    <Text style={styles.label}>Haftanın günü</Text>
    <View style={styles.wrap}>{days.map((day, weekday) => <Chip key={day} label={day} selected={values.weekday === weekday} onPress={() => { if (!busy) update("weekday", weekday); }} />)}</View>
    {errors.weekday ? <Text accessibilityRole="alert" style={styles.error}>{errors.weekday}</Text> : null}
    <FormField label="Vardiya başlangıç saati" value={values.startsAt} onChangeText={(value) => update("startsAt", value)} placeholder="09:00" maxLength={15} keyboardType="numbers-and-punctuation" autoCapitalize="none" autoCorrect={false} editable={!busy} error={errors.startsAt} hint="SS:DD; mevcut saniye ve mikrosaniyeler korunur." />
    <FormField label="Vardiya bitiş saati" value={values.endsAt} onChangeText={(value) => update("endsAt", value)} placeholder="12:00" maxLength={15} keyboardType="numbers-and-punctuation" autoCapitalize="none" autoCorrect={false} editable={!busy} error={errors.endsAt} />
    <FormField label="Geçerlilik başlangıcı" value={values.validFrom ?? ""} onChangeText={(value) => update("validFrom", value === "" ? null : value)} placeholder="YIL-AY-GÜN" maxLength={10} autoCapitalize="none" autoCorrect={false} editable={!busy} error={errors.validFrom} hint="Boş bırakırsan başlangıç tarih sınırı olmaz." />
    <FormField label="Geçerlilik sonu" value={values.validUntil ?? ""} onChangeText={(value) => update("validUntil", value === "" ? null : value)} placeholder="YIL-AY-GÜN" maxLength={10} autoCapitalize="none" autoCorrect={false} editable={!busy} error={errors.validUntil} hint="Son gün dahildir. Boş bırakırsan bitiş tarih sınırı olmaz." />
    <AppButton label="Vardiya dönemini kaydet" busy={busy} onPress={submit} />
  </View>;
}

export function EmployeeScheduleManager({ employee, onClose }: { employee: PanelRow; onClose: () => void }) {
  const { session, user, scope, context } = useManagement(); const client = useQueryClient(); const insets = useSafeAreaInsets();
  const [selectedBranchId, setSelectedBranchId] = useState(scope.branchId);
  const scheduleScope = { businessId: scope.businessId, branchId: selectedBranchId };
  const [tab, setTab] = useState<"periods" | "branches">("periods");
  const [editor, setEditor] = useState<Editor | null>(null); const [dirty, setDirty] = useState(false); const [success, setSuccess] = useState("");
  const submissionLock = useRef(false);
  const allowed = context.data?.role === "OWNER" || context.data?.role === "MANAGER";
  const query = useInfiniteQuery({
    queryKey: ["business-employee-schedule", user?.id, scheduleScope, employee.id], initialPageParam: 0,
    queryFn: ({ pageParam, signal }) => getEmployeeSchedulePage(session!.access_token, scheduleScope, employee.id, pageParam, signal),
    getNextPageParam: (last, pages) => last.hasMore ? pages.length * 25 : undefined,
    enabled: Boolean(allowed && session && scheduleScope.businessId && scheduleScope.branchId), retry: false,
  });
  const first = query.data?.pages[0];
  const currentPeriodOffset = Math.max(0, (query.data?.pages.length ?? 1) - 1) * 25;
  // Branches paginate independently; these requests never replace a period draft
  // or the period list's existing pages and optimistic snapshots.
  const branchQuery = useInfiniteQuery({
    queryKey: ["business-employee-schedule", user?.id, scheduleScope, employee.id, "branches"], initialPageParam: 0,
    queryFn: ({ pageParam, signal }) => getEmployeeSchedulePage(session!.access_token, scheduleScope, employee.id, currentPeriodOffset, signal, pageParam),
    getNextPageParam: (last, pages) => last.hasMoreBranches ? pages.length * 50 : undefined,
    enabled: Boolean(allowed && session && scope.businessId && scope.branchId && first && tab === "branches" && !editor), retry: false,
  });
  const mutation = useMutation({
    mutationFn: (values: EmployeeScheduleWrite) => saveEmployeeSchedule(session!.access_token, scheduleScope, values), retry: false,
    onSuccess: async (_, values) => {
      setDirty(false);
      if (values.action !== "setBranch") setEditor(null);
      setSuccess(values.action === "setBranch" ? "Şube ataması kaydedildi." : values.action === "deletePeriod" ? "Vardiya dönemi kaldırıldı." : "Vardiya dönemi kaydedildi.");
      await Promise.all([
        client.invalidateQueries({ queryKey: ["business-employee-schedule", user?.id] }),
        client.invalidateQueries({ queryKey: ["business-team", user?.id] }),
        client.invalidateQueries({ queryKey: ["business-panel"] }),
        client.invalidateQueries({ queryKey: ["business"] }),
      ]);
    },
    onSettled: () => { submissionLock.current = false; },
  });
  const busy = mutation.isPending;
  const save = (values: EmployeeScheduleWrite) => {
    if (!allowed || submissionLock.current || query.isFetching || branchQuery.isFetching || !first) return;
    submissionLock.current = true; setSuccess(""); mutation.mutate(values);
  };
  const leave = (callback: () => void) => {
    if (submissionLock.current) return;
    if (!dirty) callback();
    else Alert.alert("Değişiklikler kaydedilmedi", "Girdiğin vardiya bilgilerini bırakmak istiyor musun?", [{ text: "Devam et", style: "cancel" }, { text: "Değişiklikleri bırak", style: "destructive", onPress: () => { setDirty(false); callback(); } }]);
  };
  const open = (next: Editor) => { setEditor(next); setDirty(false); setSuccess(""); mutation.reset(); };
  const resetView = () => { setEditor(null); mutation.reset(); setSuccess(""); };
  const loading = busy || query.isFetching || branchQuery.isFetching;
  const stale = mutation.error instanceof ApiError && mutation.error.status === 409;
  const periods = query.data?.pages.flatMap((page) => page.periods) ?? [];
  const branchPages = branchQuery.data?.pages;
  const branches = [...new Map((branchPages?.flatMap((page) => page.branches) ?? first?.branches ?? []).map((branch) => [branch.id, branch])).values()];
  const totalBranches = branchPages?.[0].totalBranches ?? first?.totalBranches;

  return <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={() => leave(onClose)}>
    <KeyboardAvoidingView style={[styles.screen, { paddingTop: Math.max(16, insets.top) }]} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.header}><CalendarClock size={23} color={theme.colors.primary} /><View style={{ flex: 1 }}><Text style={styles.heading}>İleri vardiyalar ve şubeler</Text><Text style={styles.note}>{first?.employee.name ?? employee.title} · {context.data?.branch.name ?? "Seçili şube"}</Text></View><Pressable style={styles.close} disabled={busy} accessibilityRole="button" accessibilityLabel="İleri vardiya ekranını kapat" onPress={() => leave(onClose)}><X size={23} color={theme.colors.text} /></Pressable></View>
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: 32 + insets.bottom }]} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        {!allowed ? <Text accessibilityRole="alert" style={styles.error}>Bu araçları yalnız işletme sahibi veya yöneticisi kullanabilir.</Text> : <>
          <View style={styles.info}><Text style={styles.note}>{first ? `Saat dilimi: ${first.timezone}.` : "İşletmenin saat dilimi yükleniyor."} Çok parçalı ve tarihe bağlı dönemler çalışma zamanı ekler; tarihli dönemler haftalık planın yerine geçmez. Özel vardiya olmayan günlerde işletme saatleri kullanılır.</Text><Text style={styles.note}>İzin ve bloklar tüm şubeleri etkiler. Vardiya değişiklikleri mevcut randevuları kendiliğinden iptal etmez.</Text></View>
          {!editor ? <View style={styles.wrap}><Chip label="Vardiya dönemleri" selected={tab === "periods"} onPress={() => { if (!loading) { setTab("periods"); mutation.reset(); setSuccess(""); } }} /><Chip label="Şube atamaları" selected={tab === "branches"} onPress={() => { if (!loading) { setTab("branches"); mutation.reset(); setSuccess(""); } }} /></View> : null}
          {query.isPending ? <LoadingState label="İleri vardiya planı yükleniyor..." /> : null}
          {query.error ? <><Text accessibilityRole="alert" style={styles.error}>{employeeScheduleError(query.error)}</Text><AppButton label="İleri vardiyaları yeniden yükle" busy={query.isFetching} disabled={busy} onPress={() => void query.refetch()} /></> : null}
          {mutation.error ? <Text accessibilityRole="alert" style={styles.error}>{employeeScheduleError(mutation.error)}</Text> : null}
          {stale ? <AppButton label={tab === "branches" ? "Şube atamalarını yenile" : "Vardiya listesini yenile"} variant="secondary" busy={query.isFetching || branchQuery.isFetching} disabled={busy} onPress={() => { void query.refetch(); if (tab === "branches") void branchQuery.refetch(); }} /> : null}
          {success ? <Text accessibilityRole="alert" style={styles.success}>{success}</Text> : null}
          {editor ? <>
            <AppButton label="Vardiya listesine dön" variant="ghost" disabled={busy} onPress={() => leave(resetView)} />
            <PeriodForm key={editor.period?.id ?? "new"} employeeId={employee.id} period={editor.period} busy={loading || Boolean(query.error) || first?.branch?.active === false} onSave={save} onDirty={() => { setDirty(true); setSuccess(""); }} />
          </> : first && tab === "periods" ? <>
            <Text style={styles.heading}>{first.branch?.name ?? "Seçili şube"} · {first.total} vardiya dönemi</Text>
            {first.branch?.active === false ? <Text style={styles.warning}>Şube pasif. Mevcut dönemleri inceleyebilir veya kaldırabilirsin; yeni dönem eklenemez ve düzenlenemez.</Text> : null}
            {!first.assigned ? <Text style={styles.warning}>Çalışan seçili şubeye atanmamış. Yeni dönem eklemek için Şube atamaları bölümünden bu şubeye ata.</Text> : null}
            {!first.employee.active ? <Text style={styles.warning}>Çalışan pasif. Yeni dönem ekleme ve düzenleme için çalışanı aktifleştir; mevcut dönemleri inceleyebilir veya kaldırabilirsin.</Text> : null}
            <AppButton label="Yeni vardiya dönemi" disabled={loading || Boolean(query.error) || !first.assigned || !first.employee.active || first.branch?.active === false} onPress={() => open({})} />
            {periods.map((period) => <View key={period.id} testID={`employee-period-${period.id}`} style={styles.card}>
              <Text style={styles.label}>{days[period.weekday]} · {period.startsAt} — {period.endsAt}</Text>
              <Text style={styles.note}>{period.validFrom ?? "Başlangıç sınırı yok"} — {period.validUntil ?? "Bitiş sınırı yok"}</Text>
              <AppButton label={`Vardiyayı düzenle: ${days[period.weekday]} ${period.startsAt}`} variant="secondary" disabled={loading || Boolean(query.error) || !first.assigned || !first.employee.active || first.branch?.active === false} onPress={() => open({ period })} />
              <AppButton label={`Vardiyayı kaldır: ${days[period.weekday]} ${period.startsAt}`} variant="ghost" disabled={loading || Boolean(query.error)} onPress={() => Alert.alert("Vardiya dönemini kaldır", "Yalnız bu çalışma dönemi kaldırılacak. Özel dönem kalmayan günlerde işletme saatleri kullanılır. Mevcut randevular iptal edilmez; günü kapatmak için izin/blok kullan.", [{ text: "Vazgeç", style: "cancel" }, { text: "Dönemi kaldır", style: "destructive", onPress: () => save({ action: "deletePeriod", employeeId: employee.id, id: period.id, expected: periodSnapshot(period) }) }])} />
            </View>)}
            {!periods.length ? <Text style={styles.note}>Bu şubede özel vardiya dönemi yok.</Text> : <Text style={styles.note}>{periods.length} / {first.total} dönem gösteriliyor.</Text>}
            {query.hasNextPage ? <AppButton label="Daha fazla vardiya dönemi" variant="secondary" busy={query.isFetchingNextPage} disabled={busy || query.isFetching || Boolean(query.error)} onPress={() => void query.fetchNextPage()} /> : null}
          </> : first ? <>
            <Text style={styles.heading}>Çalışanın şube atamaları</Text>
            <Text style={styles.note}>Yetkinlikler şubeler arasında ortaktır; vardiya dönemleri her şubeye ayrıdır. Atama tek başına diğer şubenin vardiyalarını kopyalamaz.</Text>
            <Text style={styles.warning}>Bir şubede vardiya dönemi, devam eden veya gelecek aktif randevu varsa atama kaldırılamaz. Sistem kayıtları kendiliğinden silmez veya randevu iptal etmez.</Text>
            {branchQuery.error ? <><Text accessibilityRole="alert" style={styles.error}>{employeeScheduleError(branchQuery.error)}</Text><AppButton label="Şube atamalarını yeniden yükle" busy={branchQuery.isFetching} disabled={busy} onPress={() => void branchQuery.refetch()} /></> : null}
            {branches.map((branch) => <View key={branch.id} style={styles.card}><View style={styles.line}><View style={{ flex: 1 }}><Text style={styles.label}>{branch.name}</Text><Text style={styles.note}>{branch.id === scope.branchId ? "Seçili şube · " : ""}{branch.active ? "Aktif şube" : "Pasif şube"}{branch.assigned ? " · atanmış" : " · atanmamış"}</Text></View><Switch accessibilityLabel={`Şube ataması: ${branch.name}`} value={branch.assigned} disabled={loading || Boolean(query.error) || Boolean(branchQuery.error) || (!branch.assigned && !branch.active)} trackColor={{ true: theme.colors.primary }} onValueChange={(assigned) => {
              const apply = () => save({ action: "setBranch", employeeId: employee.id, targetBranchId: branch.id, assigned, expectedAssigned: branch.assigned });
              if (assigned) apply();
              else Alert.alert("Şube atamasını kaldır", `${branch.name} şubesindeki atama kaldırılacak. Vardiya veya aktif randevu varsa işlem engellenecek; hiçbir kayıt otomatik silinmez.`, [{ text: "Vazgeç", style: "cancel" }, { text: "Atamayı kaldır", style: "destructive", onPress: apply }]);
            }} /></View><AppButton label={`Vardiyaları aç: ${branch.name}`} variant="secondary" disabled={loading || Boolean(branchQuery.error)} onPress={() => leave(() => { resetView(); setSelectedBranchId(branch.id); setTab("periods"); mutation.reset(); setSuccess(""); })} /></View>)}
            {!branches.length ? <Text style={styles.note}>Yönetebileceğin şube bulunamadı.</Text> : null}
            {totalBranches !== undefined ? <Text style={styles.note}>{branches.length} / {totalBranches} şube gösteriliyor.</Text> : null}
            {branchQuery.hasNextPage ? <AppButton label="Daha fazla şube" variant="secondary" busy={branchQuery.isFetchingNextPage} disabled={loading || Boolean(branchQuery.error)} onPress={() => void branchQuery.fetchNextPage()} /> : null}
          </> : null}
        </>}
      </ScrollView>
    </KeyboardAvoidingView>
  </Modal>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F8F8FA" }, header: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 20, paddingVertical: 14, backgroundColor: theme.colors.surface }, close: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  body: { padding: 20, gap: 16 }, group: { gap: 16 }, wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, line: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  heading: { color: theme.colors.text, fontSize: 19, lineHeight: 27, fontWeight: theme.typography.weight.semibold }, label: { color: theme.colors.text, fontSize: 14, lineHeight: 21, fontWeight: theme.typography.weight.medium }, note: { color: theme.colors.muted, fontSize: 13, lineHeight: 21 },
  card: { padding: 16, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 16, backgroundColor: theme.colors.surface, gap: 12 }, info: { padding: 14, borderRadius: 12, backgroundColor: theme.colors.primarySoft, gap: 8 },
  error: { color: theme.colors.danger, fontSize: 14, lineHeight: 21 }, warning: { color: theme.colors.warning, fontSize: 13, lineHeight: 21 }, success: { color: theme.colors.success, fontSize: 14, lineHeight: 21 },
});
