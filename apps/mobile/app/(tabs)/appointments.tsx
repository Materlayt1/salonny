import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { AppButton, BrandHeader, EmptyState, ErrorState, LoadingState, Screen } from "@/components/app-ui";
import { theme } from "@/constants/theme";
import { listAppointments } from "@/lib/api";
import { useAuth } from "@/providers/auth-provider";

const statusLabels = {
  pending: "Onay bekliyor",
  confirmed: "Onaylandı",
  completed: "Tamamlandı",
  cancelled: "İptal edildi",
  no_show: "Gelmedi",
} as const;

export default function AppointmentsScreen() {
  const { session, loading } = useAuth();
  const appointments = useQuery({
    queryKey: ["appointments", session?.user.id],
    queryFn: () => listAppointments(session!.access_token),
    enabled: Boolean(session?.access_token),
  });

  if (loading) return <Screen><LoadingState label="Oturum kontrol ediliyor..." /></Screen>;
  if (!session) {
    return (
      <Screen>
        <BrandHeader />
        <EmptyState
          icon="◷"
          title="Randevuların burada"
          detail="Yaklaşan ve geçmiş randevularını yönetmek için giriş yap."
          action={<AppButton label="Giriş yap" onPress={() => router.push("/auth")} />}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <BrandHeader />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={appointments.isRefetching} onRefresh={() => void appointments.refetch()} tintColor={theme.colors.primary} />}
      >
        <View style={styles.intro}>
          <Text style={styles.title}>Randevularım</Text>
          <Text style={styles.subtitle}>Planlarını tek yerden takip et.</Text>
        </View>
        {appointments.isLoading ? <LoadingState label="Randevular getiriliyor..." /> : null}
        {appointments.isError ? <ErrorState onRetry={() => void appointments.refetch()} /> : null}
        {!appointments.isLoading && !appointments.isError && !appointments.data?.length ? (
          <EmptyState
            icon="◷"
            title="Henüz randevun yok"
            detail="Keşfet bölümünden sana uygun işletmeyi bulabilirsin."
            action={<AppButton label="İşletmeleri keşfet" variant="secondary" onPress={() => router.push("/discover")} />}
          />
        ) : null}
        <View style={styles.list}>
          {(appointments.data ?? []).map((appointment) => {
            const date = new Date(appointment.startsAt);
            return (
              <View key={appointment.id} style={styles.card}>
                <View style={styles.dateBadge}>
                  <Text style={styles.dateDay}>{date.toLocaleDateString("tr-TR", { day: "2-digit" })}</Text>
                  <Text style={styles.dateMonth}>{date.toLocaleDateString("tr-TR", { month: "short" }).toUpperCase()}</Text>
                </View>
                <View style={styles.cardBody}>
                  <View style={styles.topRow}>
                    <Text numberOfLines={1} style={styles.business}>{appointment.businessName}</Text>
                    <Text style={[styles.status, styles[`status_${appointment.status}`]]}>{statusLabels[appointment.status]}</Text>
                  </View>
                  <Text style={styles.service}>{appointment.serviceName} · {appointment.employeeName}</Text>
                  <Text style={styles.meta}>{date.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })} · {appointment.durationMinutes} dk</Text>
                  <Text numberOfLines={1} style={styles.address}>{appointment.district}, {appointment.city}</Text>
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 28 },
  intro: { paddingHorizontal: 20, paddingVertical: 10 },
  title: { color: theme.colors.text, fontSize: 30, fontWeight: "900", letterSpacing: -0.8 },
  subtitle: { color: theme.colors.muted, fontSize: 14, marginTop: 4 },
  list: { gap: 12, padding: 20 },
  card: { backgroundColor: "#fff", borderColor: theme.colors.border, borderRadius: theme.radius.lg, borderWidth: 1, flexDirection: "row", gap: 14, padding: 16 },
  dateBadge: { alignItems: "center", backgroundColor: theme.colors.primarySoft, borderRadius: 16, justifyContent: "center", minWidth: 58, padding: 10 },
  dateDay: { color: theme.colors.primaryDark, fontSize: 22, fontWeight: "900" },
  dateMonth: { color: theme.colors.primaryDark, fontSize: 10, fontWeight: "900" },
  cardBody: { flex: 1, gap: 5 },
  topRow: { alignItems: "center", flexDirection: "row", gap: 6 },
  business: { color: theme.colors.text, flex: 1, fontSize: 16, fontWeight: "800" },
  service: { color: theme.colors.text, fontSize: 13, fontWeight: "600" },
  meta: { color: theme.colors.primaryDark, fontSize: 12, fontWeight: "700" },
  address: { color: theme.colors.muted, fontSize: 12 },
  status: { borderRadius: 10, fontSize: 9, fontWeight: "800", overflow: "hidden", paddingHorizontal: 7, paddingVertical: 4 },
  status_pending: { backgroundColor: "#FFF7E8", color: theme.colors.warning },
  status_confirmed: { backgroundColor: theme.colors.successSoft, color: theme.colors.success },
  status_completed: { backgroundColor: theme.colors.primarySoft, color: theme.colors.primaryDark },
  status_cancelled: { backgroundColor: "#F3F3F5", color: theme.colors.muted },
  status_no_show: { backgroundColor: "#FEF3F2", color: theme.colors.danger },
});
