import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { AppButton, Chip, EmptyState, ErrorState, LoadingState, Screen, SectionHeader } from "@/components/app-ui";
import { theme } from "@/constants/theme";
import { changeAppointment, getRescheduleSlots, listAppointments, submitReview } from "@/lib/api";
import { Alert } from "@/lib/alert";
import { dateKey, formatDate, formatTime, upcomingDates } from "@/lib/dates";
import { useAuth } from "@/providers/auth-provider";

export default function AppointmentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session, loading } = useAuth();
  const client = useQueryClient();
  const [editing, setEditing] = useState(false);
  const dates = useMemo(() => upcomingDates(), []);
  const [date, setDate] = useState(dateKey(dates[0]));
  const [selection, setSelection] = useState({ date: "", slot: "" });
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const appointments = useQuery({ queryKey: ["appointments", session?.user.id], queryFn: ({ signal }) => listAppointments(session!.access_token, signal), enabled: Boolean(session) });
  const item = appointments.data?.find((appointment) => appointment.id === id);
  const slots = useQuery({
    queryKey: ["reschedule-slots", id, date, session?.user.id],
    queryFn: () => getRescheduleSlots(id, date, session!.access_token),
    enabled: Boolean(session && editing && item?.canReschedule), staleTime: 10_000,
  });
  const selectedSlot = selection.date === date ? selection.slot : "";
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ["appointments"] });
    void client.invalidateQueries({ queryKey: ["availability"] });
    void client.invalidateQueries({ queryKey: ["reschedule-slots"] });
    void client.invalidateQueries({ queryKey: ["session-summary"] });
  };
  const change = useMutation({
    mutationFn: (action: { action: "cancel" } | { action: "reschedule"; startsAt: string }) => changeAppointment(id, action, session!.access_token),
    onSuccess: (_result, action) => { refresh(); setEditing(false); setSelection({ date: "", slot: "" }); Alert.alert("Randevun güncellendi", action.action === "cancel" ? "İptal işlemin kaydedildi." : "Yeni tarih ve saatin kaydedildi."); },
    onError: (error) => Alert.alert("İşlem tamamlanamadı", error.message),
  });
  const review = useMutation({
    mutationFn: () => submitReview(id, rating, comment.trim(), session!.access_token),
    onSuccess: () => { refresh(); void client.invalidateQueries({ queryKey: ["business"] }); Alert.alert("Teşekkürler", "Değerlendirmen alındı."); },
    onError: (error) => Alert.alert("Değerlendirme kaydedilemedi", error.message),
  });

  if (loading || appointments.isLoading) return <Screen><LoadingState label="Randevun hazırlanıyor..." /></Screen>;
  if (!session) return <Screen><EmptyState title="Hesabına giriş yap" detail="Randevunu yönetmek için giriş yapmalısın." action={<AppButton label="Giriş yap" onPress={() => router.push("/auth")} />} /></Screen>;
  if (appointments.isError) return <Screen><ErrorState onRetry={() => void appointments.refetch()} /></Screen>;
  if (!item) return <Screen><EmptyState title="Randevu bulunamadı" detail="Bu randevu hesabında bulunmuyor." /></Screen>;

  return <Screen><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <View style={styles.hero}>
      <Text style={styles.title}>{item.businessName}</Text>
      <Text style={styles.heroDetail}>{item.serviceName} · {item.employeeName}</Text>
      <Text style={styles.heroDate}>{formatDate(item.startsAt)} · {formatTime(item.startsAt)}</Text>
      <Text style={styles.heroDetail}>{item.durationMinutes} dk · {(item.totalMinor / 100).toLocaleString("tr-TR")} {item.currency}</Text>
    </View>
    <View style={styles.card}>
      <Text style={styles.heading}>Adres</Text><Text style={styles.detail}>{item.address} · {item.district}, {item.city}</Text>
      <AppButton label="İşletmeyi görüntüle" variant="secondary" onPress={() => router.push(`/business/${item.businessSlug}`)} />
    </View>
    {item.canReschedule || item.canCancel ? <View style={styles.card}>
      <Text style={styles.heading}>Randevunu yönet</Text>
      <Text style={styles.detail}>İptal ve değişiklikler işletmenin bildirim süresine göre yapılır.</Text>
      {item.canReschedule ? <AppButton label={editing ? "Saat seçimini kapat" : "Tarih ve saati değiştir"} variant="secondary" disabled={change.isPending} onPress={() => setEditing((value) => !value)} /> : null}
      {item.canCancel ? <AppButton label="Randevuyu iptal et" variant="danger" busy={change.isPending} onPress={() => Alert.alert("Randevuyu iptal et", `${item.businessName} için ${formatDate(item.startsAt)} ${formatTime(item.startsAt)} randevun iptal edilecek.`, [{ text: "Vazgeç", style: "cancel" }, { text: "İptal et", style: "destructive", onPress: () => change.mutate({ action: "cancel" }) }])} /> : null}
    </View> : null}
    {editing ? <View>
      <SectionHeader title="Yeni tarih ve saat" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dates}>{dates.map((day) => <Chip key={dateKey(day)} label={formatDate(day)} selected={date === dateKey(day)} onPress={() => setDate(dateKey(day))} />)}</ScrollView>
      <View style={styles.card}>
        {slots.isLoading ? <LoadingState label="Uygun saatler aranıyor..." /> : null}
        {slots.isError ? <ErrorState onRetry={() => void slots.refetch()} /> : null}
        {!slots.isLoading && !slots.isError && !slots.data?.slots.length ? <Text style={styles.detail}>Bu tarihte uygun saat bulunamadı.</Text> : null}
        <View style={styles.grid}>{(slots.data?.slots ?? []).map((slot) => <Chip key={slot} label={formatTime(slot)} selected={selectedSlot === slot} onPress={() => setSelection({ date, slot })} />)}</View>
        <AppButton label="Yeni saati kaydet" disabled={!selectedSlot} busy={change.isPending} onPress={() => change.mutate({ action: "reschedule", startsAt: selectedSlot })} />
      </View>
    </View> : null}
    {item.status === "completed" && !item.reviewId ? <View style={styles.card}>
      <Text style={styles.heading}>Deneyimini değerlendir</Text>
      <View style={styles.grid}>{[1, 2, 3, 4, 5].map((value) => <Chip key={value} label={`${value} ★`} selected={rating === value} onPress={() => setRating(value)} />)}</View>
      <TextInput accessibilityLabel="Değerlendirmen" placeholder="Deneyimini paylaş (isteğe bağlı)" placeholderTextColor={theme.colors.muted} multiline maxLength={2000} value={comment} onChangeText={setComment} style={styles.input} />
      <AppButton label="Değerlendirmeyi gönder" busy={review.isPending} onPress={() => review.mutate()} />
    </View> : null}
    {item.reviewId ? <View style={styles.card}><Text style={styles.heading}>Değerlendirmen · {item.reviewRating} ★</Text><Text style={styles.detail}>{item.reviewComment || "Değerlendirmen kaydedildi."}</Text></View> : null}
  </ScrollView></Screen>;
}

const styles = StyleSheet.create({
  content: { paddingBottom: 32 }, hero: { backgroundColor: theme.colors.primary, gap: 8, padding: 24 },
  title: { color: "#fff", fontSize: 25, fontWeight: "900" }, heroDetail: { color: "#EEEAFE", fontSize: 14 }, heroDate: { color: "#fff", fontSize: 19, fontWeight: "800", marginVertical: 6 },
  card: { backgroundColor: "#fff", borderRadius: 20, gap: 14, marginHorizontal: 20, marginTop: 16, padding: 18 },
  heading: { color: theme.colors.text, fontSize: 17, fontWeight: "800" }, detail: { color: theme.colors.muted, fontSize: 13, lineHeight: 20 },
  dates: { gap: 8, paddingHorizontal: 20 }, grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  input: { backgroundColor: theme.colors.background, borderRadius: 12, minHeight: 100, padding: 14, color: theme.colors.text, textAlignVertical: "top" },
});
