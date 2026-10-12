import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { BarChart3, CalendarDays, CheckCircle2, Clock3, Info } from "lucide-react-native";
import { AppButton, Chip, EmptyState, LoadingState } from "@/components/app-ui";
import { theme } from "@/constants/theme";
import { formatReportMoney, getBusinessReport, reportPercentChange, reportValueChange, type BusinessReport as Report, type ReportDays, type ReportDimension } from "@/lib/business-report";
import { useManagement } from "@/providers/management-provider";

const dayLabel = (value: string, full = false) => new Date(`${value}T12:00:00Z`).toLocaleDateString("tr-TR", { timeZone: "UTC", day: "numeric", month: full ? "long" : "short", ...(full ? { year: "numeric" as const } : {}) });
const endDate = (exclusive: string) => new Date(Date.parse(`${exclusive}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
const countLabel = (value: number) => value.toLocaleString("tr-TR");
const rate = (part: number, total: number) => total === 0 ? "Hesaplanamaz" : `${(part / total * 100).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}%`;
const minuteLabel = (value: number) => `${value.toLocaleString("tr-TR", { maximumFractionDigits: 1 })} dk`;
const dimensionLabels: { key: ReportDimension; label: string; more: string }[] = [{ key: "service", label: "Hizmetler", more: "Daha fazla hizmet" }, { key: "employee", label: "Uzmanlar", more: "Daha fazla uzman" }, { key: "branch", label: "Şubeler", more: "Daha fazla şube" }];

function Metric({ label, value, previous, change, detail }: { label: string; value: string; previous: string; change?: string; detail?: string }) {
  return <View style={styles.metric} accessible accessibilityLabel={`${label}: ${value}. Önceki dönem: ${previous}.${detail ? ` ${detail}` : ""}${change ? ` ${change}` : ""}`}>
    <Text style={styles.caption}>{label}</Text><Text style={styles.metricValue}>{value}</Text><Text style={styles.note}>Önceki dönem: {previous}</Text>{detail ? <Text style={styles.note}>{detail}</Text> : null}{change ? <Text style={styles.comparison}>{change}</Text> : null}
  </View>;
}

function DailyChart({ report }: { report: Report }) {
  const peak = Math.max(1, ...report.daily.map((day) => day.total));
  return <View style={styles.card}>
    <View style={styles.line}><BarChart3 size={20} color={theme.colors.primary} /><Text style={styles.subheading}>Günlük randevular</Text></View>
    <Text style={styles.note}>Başlangıç gününe göre tüm durumlar. Günler işletmenin saat dilimindedir; bugünün eksik verisi eklenmez.</Text>
    <ScrollView testID="business-report-chart" horizontal showsHorizontalScrollIndicator contentContainerStyle={styles.chart} accessibilityLabel="Günlük randevu grafiği">
      {report.daily.map((day) => <View key={day.date} style={styles.chartDay} accessible accessibilityLabel={`${dayLabel(day.date, true)}: ${countLabel(day.total)} randevu`}>
        <Text style={styles.barCount}>{countLabel(day.total)}</Text><View style={styles.barTrack}><View style={[styles.bar, { height: day.total ? Math.max(3, day.total / peak * 112) : 0 }]} /></View><Text style={styles.barDate}>{dayLabel(day.date)}</Text>
      </View>)}
    </ScrollView>
  </View>;
}

function PlannedUtilization({ report }: { report: Report }) {
  const plan = report.utilization;
  return <View style={styles.card}>
    <View style={styles.line}><Clock3 size={20} color={theme.colors.primary} /><Text style={styles.subheading}>Gelecek 7 gün planlanan doluluk</Text></View>
    <Text style={styles.note}>{dayLabel(plan.from)} – {dayLabel(endDate(plan.toExclusive))} · {report.period.timezone}</Text>
    <Text style={styles.metricValue}>{plan.ratio === null ? "Hesaplanamaz" : `${(plan.ratio * 100).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}%`}</Text>
    <Text style={styles.note}>{minuteLabel(plan.busyMinutes)} dolu / {minuteLabel(plan.availableMinutes)} kullanılabilir uzman süresi</Text>
    <Text style={styles.note}>Mevcut vardiya, şube molası ve uzman izinleriyle hesaplanır. Bekleyen/onaylı randevuların kapasite içindeki birleşimi kullanılır; çakışmalar iki kez sayılmaz. Bugün hariç gelecek 7 tam günün planıdır, geçmiş doluluk veya gerçekleşen çalışma değildir.</Text>
    <Text style={styles.note}>Çalışan takvim doluluğu; diğer şubelerdeki randevular da çalışanı meşgul sayar. Kaynak kapasitesi, en erken randevu ve rezervasyon penceresi bu ölçüme dahil değildir; müşteriye açık saat garantisi vermez.</Text>
    {plan.availableMinutes === 0 ? <Text style={styles.note}>Bu aralıkta kullanılabilir çalışma planı bulunmadığından doluluk oranı hesaplanamaz.</Text> : null}
    {plan.outsideCapacityMinutes > 0 ? <View style={styles.warning}><Text style={styles.warningText}>Plan dışı randevu uyarısı: Seçili rapor kapsamındaki {minuteLabel(plan.outsideCapacityMinutes)} bekleyen/onaylı randevu mevcut kapasitenin dışında. Vardiya, izin veya şube atamalarını kontrol et.</Text></View> : null}
  </View>;
}

function ReportContent() {
  const { session, user, scope, context } = useManagement();
  const [days, setDays] = useState<ReportDays>(30); const [allBranches, setAllBranches] = useState(false); const [dimension, setDimension] = useState<ReportDimension>("service"); const [chosenCurrency, setChosenCurrency] = useState("");
  const filters = { days, allBranches, dimension };
  const query = useInfiniteQuery({
    queryKey: ["business-report", user?.id, session?.access_token, scope.businessId, scope.branchId, days, allBranches, dimension],
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) => getBusinessReport(session!.access_token, scope, filters, pageParam, signal),
    getNextPageParam: (last) => last.breakdown.hasMore ? last.breakdown.offset + 25 : undefined,
    enabled: Boolean(session?.access_token && scope.businessId && scope.branchId), retry: false,
  });
  const report = query.data?.pages[0]; const previous = report?.summary.previous; const current = report?.summary.current;
  const currencies = report ? [...new Set([...report.summary.current.values, ...report.summary.previous.values].map((value) => value.currency))].sort() : [];
  const currency = currencies.includes(chosenCurrency) ? chosenCurrency : currencies.includes("TRY") ? "TRY" : currencies[0];
  const currentMinor = current?.values.find((value) => value.currency === currency)?.minor ?? "0"; const previousMinor = previous?.values.find((value) => value.currency === currency)?.minor ?? "0";
  const rows = query.data?.pages.flatMap((page) => page.breakdown.rows) ?? [];
  // No cursor/snapshot is promised by this API. Never combine visibly changed
  // result pages or duplicate groups into an apparently complete breakdown.
  const coherentPages = !report || Boolean(query.data?.pages.every((page) => JSON.stringify({ period: page.period, scope: page.scope, summary: page.summary, total: page.breakdown.total }) === JSON.stringify({ period: report.period, scope: report.scope, summary: report.summary, total: report.breakdown.total })) && new Set(rows.map((row) => row.id)).size === rows.length);
  const selectedDimension = dimensionLabels.find((item) => item.key === dimension)!;
  const refreshing = query.isRefetching && !query.isFetchingNextPage;
  const showReport = Boolean(report && !query.error && !refreshing);
  return <ScrollView testID="business-report-content" contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void query.refetch()} tintColor={theme.colors.primary} />}>
    <View style={styles.title}><View style={styles.line}><BarChart3 size={24} color={theme.colors.primary} /><Text style={styles.heading}>Raporlar</Text></View><Text style={styles.note}>Kesilmiş randevu listesi yerine seçili dönemin tamamından hesaplanan özet.</Text></View>
    <View style={styles.filters}><Text style={styles.label}>Tamamlanmış günler</Text><View style={styles.wrap}>{([7, 30, 90] as const).map((value) => <Chip key={value} label={`${value} gün`} selected={days === value} onPress={() => { setDays(value); setChosenCurrency(""); }} />)}</View><View style={styles.wrap}><Chip label="Seçili şube" selected={!allBranches} onPress={() => setAllBranches(false)} /><Chip label="Tüm şubeler" selected={allBranches} onPress={() => setAllBranches(true)} /></View><Text style={styles.note}>{allBranches ? "İşletmenin tüm şubeleri" : context.data?.branch.name ?? "Seçili şube"}{report?.scope.employeeId ? " · yalnızca sana atanmış randevular ve çalışma planın" : ""}</Text><AppButton label="Raporu yenile" variant="ghost" busy={refreshing} disabled={query.isPending || query.isFetchingNextPage} onPress={() => void query.refetch()} /></View>
    {query.isPending || refreshing ? <LoadingState label="Rapor hazırlanıyor..." /> : null}
    {query.error ? <EmptyState title="Rapor alınamadı" detail={query.error.message} action={<AppButton label="Raporu yeniden yükle" onPress={() => void query.refetch()} />} /> : null}
    {showReport && report && current && previous ? <>
      <View style={styles.period}><CalendarDays size={18} color={theme.colors.primary} /><View style={{ flex: 1 }}><Text style={styles.label}>{dayLabel(report.period.from)} – {dayLabel(endDate(report.period.toExclusive))}</Text><Text style={styles.note}>Önceki dönem: {dayLabel(report.period.previousFrom)} – {dayLabel(endDate(report.period.from))}</Text><Text style={styles.note}>{report.period.timezone} · bugün hariç {report.period.days} tam gün</Text></View></View>
      {current.total === 0 ? <View style={styles.info}><Text style={styles.note}>Bu dönemde randevu bulunmuyor. Günlük seri ve toplamlar sıfırdır; sıfır paydada oran hesaplanmaz.</Text></View> : null}
      <View testID="business-report-summary" style={styles.summary}><View style={styles.metrics}>
        <Metric label="Randevular" value={countLabel(current.total)} previous={countLabel(previous.total)} change={reportPercentChange(current.total, previous.total)} />
        <Metric label="Tamamlandı" value={countLabel(current.completed)} previous={countLabel(previous.completed)} change={reportPercentChange(current.completed, previous.completed)} />
        <Metric label="İptal oranı" value={rate(current.cancelled, current.total)} previous={`${rate(previous.cancelled, previous.total)} (${countLabel(previous.cancelled)} / ${countLabel(previous.total)})`} detail={`${countLabel(current.cancelled)} / ${countLabel(current.total)} randevu`} />
        <Metric label="Gelmedi oranı" value={rate(current.noShow, current.total)} previous={`${rate(previous.noShow, previous.total)} (${countLabel(previous.noShow)} / ${countLabel(previous.total)})`} detail={`${countLabel(current.noShow)} / ${countLabel(current.total)} randevu`} />
      </View>
      <View style={styles.card}><View style={styles.line}><CheckCircle2 size={20} color={theme.colors.primary} /><Text style={styles.subheading}>Tamamlanan randevu tutarı</Text></View><Text style={styles.label}>Tahsil edilmiş ödeme değildir.</Text><Text style={styles.note}>Kaydedilen randevu toplamlarıdır; para birimleri birbirine çevrilmez veya toplanmaz.</Text>{currencies.length > 1 ? <View style={styles.wrap}>{currencies.map((value) => <Chip key={value} label={value} selected={currency === value} onPress={() => setChosenCurrency(value)} />)}</View> : null}{currency ? <><Text style={styles.balance}>{formatReportMoney(currentMinor, currency)}</Text><Text style={styles.note}>Önceki dönem: {formatReportMoney(previousMinor, currency)}</Text><Text style={styles.comparison}>{reportValueChange(currentMinor, previousMinor)}</Text></> : <Text style={styles.note}>Bu iki dönemde tamamlanan randevu tutarı yok.</Text>}<Text style={styles.note}>Planlanan randevu süresi: {minuteLabel(current.bookedMinutes)} · önceki dönem {minuteLabel(previous.bookedMinutes)}. Bekleyen, onaylı ve tamamlanmış randevuların kayıtlı süresidir; gerçekleşen çalışma/katılım ölçümü değildir.</Text></View></View>
      <DailyChart report={report} />
      <View testID="business-report-breakdown" style={styles.card}><Text style={styles.subheading}>Dönem kırılımı</Text><View style={styles.wrap}>{dimensionLabels.map((item) => <Chip key={item.key} label={item.label} selected={dimension === item.key} onPress={() => setDimension(item.key)} />)}</View><Text style={styles.note}>{countLabel(report.breakdown.total)} {dimension === "service" ? "hizmet" : dimension === "employee" ? "uzman" : "şube"} · sayfa başına 25</Text>{dimension === "service" ? <Text style={styles.note}>Hizmet katılımı; randevu birden fazla hizmet içerebilir. Aynı hizmette tek randevu bir kez sayılır. Tutar hizmetlere paylaştırılmaz.</Text> : null}
        {!coherentPages ? <><Text accessibilityRole="alert" style={styles.error}>Rapor kayıtları yükleme sırasında değişti. Sayfaları birlikte göstermek için raporu yeniden yükle.</Text><AppButton label="Değişen raporu yeniden yükle" variant="secondary" onPress={() => void query.refetch()} /></> : <>{!rows.length ? <Text style={styles.note}>Bu dönemde {dimension === "service" ? "hizmet katılımı" : dimension === "employee" ? "uzman randevusu" : "şube randevusu"} bulunmuyor.</Text> : null}{rows.map((row) => <View key={row.id} style={styles.breakdownRow}><Text style={styles.label}>{row.label}</Text><Text style={styles.note}>{countLabel(row.total)} randevu · {countLabel(row.completed)} tamamlandı</Text><Text style={styles.note}>{countLabel(row.cancelled)} iptal · {countLabel(row.noShow)} gelmedi · {minuteLabel(row.bookedMinutes)} kayıtlı süre</Text>{row.values ? row.values.length ? row.values.map((value) => <Text key={value.currency} style={styles.rowValue}>{formatReportMoney(value.minor, value.currency)} tamamlanan randevu tutarı</Text>) : <Text style={styles.note}>Tamamlanan randevu tutarı yok.</Text> : null}</View>)}{query.hasNextPage ? <AppButton label={selectedDimension.more} variant="secondary" busy={query.isFetchingNextPage} onPress={() => void query.fetchNextPage()} /> : null}</>}
      </View>
      <PlannedUtilization report={report} />
      <View style={styles.footer}><Info size={16} color={theme.colors.muted} /><Text style={[styles.note, { flex: 1 }]}>Bu ekran salt okunurdur. Randevu, kupon, müşteri veya ödeme kaydı oluşturmaz. Özet sayıları tüm dönemi kapsar; aşağıda yüklenen kırılım satırlarıyla sınırlı değildir.</Text></View>
    </> : null}
  </ScrollView>;
}

export function BusinessReport() {
  const { context, session, scope, user } = useManagement();
  if (context.isPlaceholderData || context.isFetching) return <LoadingState label="Seçili işletme ve şube yükleniyor..." />;
  if (!session?.access_token || !context.data?.financialVisibility || !context.data.permissions.reports || !scope.businessId || !scope.branchId) return <EmptyState title="Rapor yetkisi gerekli" detail="Raporları görmek için rapor izni ve finansal görünürlük gerekir." />;
  return <ReportContent key={`${user?.id}-${session.access_token}-${scope.businessId}-${scope.branchId}`} />;
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 36, gap: 16 }, title: { gap: 8 }, heading: { color: theme.colors.text, fontSize: 24, lineHeight: 32, fontWeight: theme.typography.weight.semibold, letterSpacing: -0.4 }, subheading: { color: theme.colors.text, fontSize: 17, lineHeight: 25, fontWeight: theme.typography.weight.semibold, flexShrink: 1 }, label: { color: theme.colors.text, fontSize: 14, lineHeight: 22, fontWeight: theme.typography.weight.medium }, caption: { color: theme.colors.muted, fontSize: 13, lineHeight: 20, fontWeight: theme.typography.weight.medium }, note: { color: theme.colors.muted, fontSize: 13, lineHeight: 21 }, comparison: { color: theme.colors.primaryDark, fontSize: 12, lineHeight: 19 }, line: { flexDirection: "row", alignItems: "center", gap: 9 }, wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, filters: { gap: 12 }, period: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 14, backgroundColor: theme.colors.primarySoft, borderRadius: 14 },
  card: { padding: 16, borderRadius: 16, borderColor: theme.colors.border, borderWidth: 1, backgroundColor: theme.colors.surface, gap: 12 }, summary: { gap: 16 }, metrics: { flexDirection: "row", flexWrap: "wrap", gap: 12 }, metric: { flexGrow: 1, flexBasis: "45%", padding: 14, gap: 6, backgroundColor: theme.colors.surface, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.border, minWidth: 0 }, metricValue: { color: theme.colors.text, fontSize: 25, lineHeight: 33, fontWeight: theme.typography.weight.medium }, balance: { color: theme.colors.primary, fontSize: 23, lineHeight: 32, fontWeight: theme.typography.weight.medium, flexShrink: 1 }, info: { backgroundColor: theme.colors.primarySoft, padding: 14, borderRadius: 14 }, chart: { gap: 6, paddingVertical: 10, paddingRight: 4 }, chartDay: { width: 44, alignItems: "center", gap: 6 }, barCount: { color: theme.colors.text, fontSize: 11, fontWeight: theme.typography.weight.medium, textAlign: "center" }, barTrack: { height: 112, width: 22, justifyContent: "flex-end", backgroundColor: "#F5F3FE", borderRadius: 6, overflow: "hidden" }, bar: { width: "100%", backgroundColor: theme.colors.primary, borderRadius: 6 }, barDate: { color: theme.colors.muted, fontSize: 10, textAlign: "center", lineHeight: 15 }, breakdownRow: { paddingVertical: 12, borderTopWidth: 1, borderTopColor: theme.colors.border, gap: 5 }, rowValue: { color: theme.colors.primaryDark, fontSize: 13, lineHeight: 22, fontWeight: theme.typography.weight.medium }, warning: { padding: 12, backgroundColor: "#FFF5E8", borderRadius: 12 }, warningText: { color: theme.colors.warning, fontSize: 13, lineHeight: 21 }, error: { color: theme.colors.danger, fontSize: 13, lineHeight: 21 }, footer: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
});
