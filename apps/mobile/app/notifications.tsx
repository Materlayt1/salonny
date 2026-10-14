import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, type Href } from "expo-router";
import { notificationDestination, type NotificationItem } from "@salonny/contracts";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { AppButton, EmptyState, ErrorState, LoadingState, Screen } from "@/components/app-ui";
import { theme } from "@/constants/theme";
import { listNotifications, markNotificationsRead } from "@/lib/api";
import { Alert } from "@/lib/alert";
import { formatDate, formatTime } from "@/lib/dates";
import { useAuth } from "@/providers/auth-provider";

export default function NotificationsScreen() {
  const { session, loading } = useAuth();
  const client = useQueryClient();
  const notifications = useQuery({ queryKey: ["notifications", session?.user.id, session?.access_token], queryFn: ({ signal }) => listNotifications(session!.access_token, signal), enabled: Boolean(session) });
  const mark = useMutation({
    mutationFn: (ids?: string[]) => markNotificationsRead(session!.access_token, ids),
    onSuccess: () => { void client.invalidateQueries({ queryKey: ["notifications"] }); void client.invalidateQueries({ queryKey: ["session-summary"] }); },
  });
  const openNotification = (item: NotificationItem) => {
    // Opening a screen must not wait on the read receipt or its network failure.
    if (!item.readAt) mark.mutate([item.id]);
    void client.invalidateQueries({ queryKey: ["appointments"] });
    void client.invalidateQueries({ queryKey: ["business-panel"] });
    router.push(notificationDestination(item, "mobile").href as Href);
  };
  if (loading || notifications.isLoading) return <Screen><LoadingState label="Bildirimler yükleniyor..." /></Screen>;
  if (!session) return <Screen><EmptyState title="Hesabına giriş yap" detail="Bildirimlerini görmek için giriş yapmalısın." action={<AppButton label="Giriş yap" onPress={() => router.push("/auth")} />} /></Screen>;
  if (notifications.isError) return <Screen><ErrorState onRetry={() => void notifications.refetch()} /></Screen>;
  const unread = notifications.data?.notifications.some((item) => !item.readAt);
  return <Screen><FlatList
    data={notifications.data?.notifications ?? []} keyExtractor={(item) => item.id} contentContainerStyle={styles.content}
    refreshControl={<RefreshControl refreshing={notifications.isRefetching} onRefresh={() => void notifications.refetch()} tintColor={theme.colors.primary} />}
    ListHeaderComponent={<View style={styles.header}><Text style={styles.title}>Bildirimlerin</Text>{unread ? <AppButton label="Tümünü okundu işaretle" variant="secondary" busy={mark.isPending} onPress={() => mark.mutate(undefined, { onError: (error) => Alert.alert("İşlem tamamlanamadı", error.message) })} /> : null}{mark.isError ? <Text accessibilityRole="alert" style={styles.error}>Okundu bilgisi kaydedilemedi. Bildirimi yine de açabilirsin.</Text> : null}</View>}
    ListEmptyComponent={<EmptyState title="Her şey güncel" detail="Yeni randevu ve işletme bildirimlerin burada görünür." />}
    renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={`${item.title}${item.readAt ? "" : ", okunmadı"}`} accessibilityHint={notificationDestination(item, "mobile").label} onPress={() => openNotification(item)} style={[styles.card, !item.readAt && styles.unread]}>
      <View style={styles.row}><Text style={styles.heading}>{item.title}</Text>{!item.readAt ? <View style={styles.dot} /> : null}</View><Text style={styles.body}>{item.body}</Text><Text style={styles.date}>{formatDate(item.createdAt)} · {formatTime(item.createdAt)}</Text><Text style={styles.link}>{notificationDestination(item, "mobile").label} →</Text>
    </Pressable>}
  /></Screen>;
}

const styles = StyleSheet.create({
  error: { color: theme.colors.danger, fontSize: 12 }, link: { color: theme.colors.primary, fontSize: 12, fontWeight: "500", marginTop: 2 },
  content: { padding: 20, paddingBottom: 40 }, header: { gap: 16, marginBottom: 20 }, title: { color: theme.colors.text, fontSize: 28, fontWeight: theme.typography.weight.semibold },
  card: { backgroundColor: "#fff", borderColor: theme.colors.border, borderWidth: 1, borderRadius: 18, gap: 8, marginBottom: 12, padding: 18 }, unread: { borderColor: theme.colors.primary, backgroundColor: "#F5F2FF" },
  row: { flexDirection: "row", alignItems: "center", gap: 8 }, heading: { color: theme.colors.text, fontWeight: theme.typography.weight.semibold, fontSize: 15, flex: 1 }, body: { color: theme.colors.muted, fontSize: 13, lineHeight: 20 }, date: { color: theme.colors.muted, fontSize: 11 }, dot: { backgroundColor: theme.colors.primary, width: 8, height: 8, borderRadius: 4 },
});
