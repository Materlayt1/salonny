import { useInfiniteQuery, useMutation, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { router, useFocusEffect, type Href } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { defaultNotificationFilters, notificationDestination, notificationFilters, notificationKind, type NotificationItem, type NotificationPage } from "@salonny/contracts";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { Bell, CalendarDays, ChevronRight, Gift, Star } from "lucide-react-native";
import { AppButton, Chip, EmptyState, ErrorState, LoadingState, Screen } from "@/components/app-ui";
import { theme } from "@/constants/theme";
import { listNotifications, markNotificationsRead } from "@/lib/api";
import { formatDate, formatTime } from "@/lib/dates";
import { useAuth } from "@/providers/auth-provider";

export default function NotificationsScreen() {
  const { session, loading } = useAuth();
  const client = useQueryClient();
  const [filters, setFilters] = useState(defaultNotificationFilters);
  const key = useMemo(() => ["notifications", session?.user.id, session?.access_token, filters], [session?.user.id, session?.access_token, filters]);
  const notifications = useInfiniteQuery({
    queryKey: key, initialPageParam: null as string | null,
    queryFn: ({ signal, pageParam }) => listNotifications(session!.access_token, signal, filters, pageParam),
    getNextPageParam: (page) => page.nextCursor ?? undefined, enabled: Boolean(session),
  });
  const refresh = useCallback(() => {
    client.setQueryData<InfiniteData<NotificationPage, string | null>>(key, (data) => data ? { ...data, pages: data.pages.slice(0, 1), pageParams: data.pageParams.slice(0, 1) } : data);
    return client.refetchQueries({ queryKey: key, exact: true });
  }, [client, key]);
  // Retained navigation stacks show new notices on return, starting at page one.
  useFocusEffect(useCallback(() => { if (session && client.getQueryData(key)) void refresh(); }, [session, client, key, refresh]));
  const mark = useMutation({
    mutationFn: ({ ids, before }: { ids?: string[]; before?: string }) => markNotificationsRead(session!.access_token, ids, before),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["notifications"] });
      void client.invalidateQueries({ queryKey: ["notification-summary"] });
      void client.invalidateQueries({ queryKey: ["session-summary"] });
    },
  });
  const openNotification = (item: NotificationItem) => {
    if (!item.readAt) mark.mutate({ ids: [item.id] });
    void client.invalidateQueries({ queryKey: ["appointments"] });
    void client.invalidateQueries({ queryKey: ["business-panel"] });
    void client.invalidateQueries({ queryKey: ["business-reviews"] });
    // Navigation never waits for the receipt or its failure.
    router.push(notificationDestination(item, "mobile").href as Href);
  };
  if (loading) return <Screen><LoadingState label="Bildirimler yükleniyor..." /></Screen>;
  if (!session) return <Screen><EmptyState title="Hesabına giriş yap" detail="Bildirimlerini görmek için giriş yapmalısın." action={<AppButton label="Giriş yap" onPress={() => router.push("/auth")} />} /></Screen>;
  const pages = notifications.data?.pages ?? [];
  const first = pages[0];
  const items = [...new Map(pages.flatMap((page) => page.notifications).map((item) => [item.id, item])).values()];
  return <Screen><FlatList
    style={styles.list} data={items} keyExtractor={(item) => item.id} contentContainerStyle={styles.content}
    refreshControl={<RefreshControl refreshing={notifications.isRefetching && !notifications.isFetchingNextPage} onRefresh={() => void refresh()} tintColor={theme.colors.primary} />}
    ListHeaderComponent={<View style={styles.header}>
      <Text style={styles.title}>Bildirimlerin</Text><Text style={styles.body}>Randevuların ve işletmenden gelen güncellemeler.</Text>
      <View style={styles.filters}>{notificationFilters.map((filter) => <Chip key={filter.value} label={filter.label} selected={filter.value === filters.kind} onPress={() => setFilters((value) => ({ ...value, kind: filter.value }))} />)}</View>
      <Chip label="Yalnız okunmamış" selected={filters.unread} onPress={() => setFilters((value) => ({ ...value, unread: !value.unread }))} />
      {first && first.unreadCount > 0 ? <AppButton label="Tümünü okundu işaretle" variant="ghost" busy={mark.isPending} disabled={notifications.isFetching} onPress={() => mark.mutate({ before: first.before })} /> : null}
      {mark.isError ? <Text accessibilityRole="alert" style={styles.error}>Okundu bilgisi kaydedilemedi. Bildirimi yine de açabilirsin.</Text> : null}
      {notifications.isRefetchError ? <View><Text accessibilityRole="alert" style={styles.error}>Bildirimler yenilenemedi. Son alınan kayıtları görüyorsun.</Text><AppButton label="Yeniden dene" variant="ghost" onPress={() => void refresh()} /></View> : null}
    </View>}
    ListEmptyComponent={notifications.isPending ? <LoadingState label="Bildirimler yükleniyor..." /> : notifications.isError ? <ErrorState onRetry={() => void refresh()} /> : <EmptyState title={filters.unread ? "Okunmamış bildirim yok" : "Bu bölümde bildirim yok"} detail="Yeni randevu ve işletme bildirimlerin burada görünür." />}
    ListFooterComponent={items.length ? <View style={styles.footer}>{notifications.isFetchNextPageError ? <Text accessibilityRole="alert" style={styles.error}>Önceki bildirimler alınamadı. Mevcut listen korunuyor.</Text> : null}{notifications.hasNextPage ? <AppButton label={notifications.isFetchNextPageError ? "Önceki bildirimleri yeniden dene" : "Önceki bildirimleri yükle"} variant="secondary" busy={notifications.isFetchingNextPage} disabled={notifications.isFetching && !notifications.isFetchingNextPage} onPress={() => void notifications.fetchNextPage()} /> : !notifications.isError ? <Text style={styles.date}>Tüm bildirimler gösterildi.</Text> : null}<AppButton label="Yeni bildirimleri getir" variant="ghost" onPress={() => void refresh()} disabled={notifications.isFetching} /></View> : null}
    renderItem={({ item }) => {
      const kind = notificationKind(item.type);
      const Icon = kind === "review" ? Star : kind === "campaign" ? Gift : kind === "appointment" ? CalendarDays : Bell;
      const destination = notificationDestination(item, "mobile");
      return <Pressable accessibilityRole="button" accessibilityLabel={item.title + (item.readAt ? "" : ", okunmadı")} accessibilityHint={destination.label} onPress={() => openNotification(item)} style={[styles.card, !item.readAt && styles.unread]}>
        <View style={styles.icon}><Icon color={theme.colors.primary} size={20} /></View>
        <View style={styles.cardBody}><View style={styles.row}><Text style={styles.heading}>{item.title}</Text>{!item.readAt ? <View style={styles.dot} /> : null}</View><Text style={styles.body}>{item.body}</Text><Text style={styles.date}>{formatDate(item.createdAt)} · {formatTime(item.createdAt)}</Text><View style={styles.row}><Text style={styles.link}>{destination.label}</Text><ChevronRight size={15} color={theme.colors.primary} /></View></View>
      </Pressable>;
    }}
  /></Screen>;
}

const styles = StyleSheet.create({
  list: { width: "100%", maxWidth: 800, alignSelf: "center" }, cardBody: { flex: 1, minWidth: 0, gap: 7 }, icon: { width: 38, height: 38, borderRadius: 12, backgroundColor: theme.colors.primarySoft, alignItems: "center", justifyContent: "center" },
  filters: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 }, footer: { gap: 8, paddingVertical: 12 },
  error: { color: theme.colors.danger, fontSize: 12 }, link: { color: theme.colors.primary, fontSize: 12, fontWeight: "500", marginTop: 2 },
  content: { padding: 20, paddingBottom: 40 }, header: { gap: 8, marginBottom: 20 }, title: { color: theme.colors.text, fontSize: 26, fontWeight: "600" },
  card: { flexDirection: "row", backgroundColor: "#fff", borderColor: theme.colors.border, borderWidth: 1, borderRadius: 18, gap: 12, marginBottom: 12, padding: 16 }, unread: { borderColor: "#DCD3FC", backgroundColor: "#FAF8FF" },
  row: { flexDirection: "row", alignItems: "center", gap: 8 }, heading: { color: theme.colors.text, fontWeight: theme.typography.weight.semibold, fontSize: 15, flex: 1 }, body: { color: theme.colors.muted, fontSize: 13, lineHeight: 20 }, date: { color: theme.colors.muted, fontSize: 11 }, dot: { backgroundColor: theme.colors.primary, width: 8, height: 8, borderRadius: 4 },
});
