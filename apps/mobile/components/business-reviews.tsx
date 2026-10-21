import { useInfiniteQuery } from "@tanstack/react-query";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { Star } from "lucide-react-native";
import { AppButton, EmptyState, ErrorState, LoadingState } from "@/components/app-ui";
import { useManagement } from "@/providers/management-provider";
import { requestJson } from "@/lib/api";
import { formatDate } from "@/lib/dates";
import { theme } from "@/constants/theme";

type Review = { id: string; rating: number; comment: string | null; business_reply: string | null; moderation_status: string; created_at: string };
const statuses: Record<string, string> = { approved: "Yayında", pending: "İncelemede", rejected: "Yayınlanmadı", flagged: "İncelemede" };
export function BusinessReviews() {
  const { scope, session, user, context } = useManagement();
  const allowed = context.data?.role === "OWNER" || context.data?.role === "MANAGER";
  const reviews = useInfiniteQuery({
    queryKey: ["business-reviews", user?.id, session?.access_token, scope.businessId, scope.branchId],
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) => requestJson<{ rows: Review[]; hasMore: boolean }>(`/api/business-management/reviews?${new URLSearchParams({ businessId: scope.businessId!, branchId: scope.branchId!, offset: String(pageParam) })}`, { signal }, session!.access_token),
    getNextPageParam: (last, pages) => last.hasMore ? pages.length * 25 : undefined,
    enabled: Boolean(allowed && session && scope.businessId && scope.branchId), retry: false,
  });
  if (!allowed) return <EmptyState title="Bu bölüme erişimin yok" detail="Değerlendirmeleri işletme sahibi ve yöneticileri görüntüleyebilir." />;
  return <FlatList data={reviews.data?.pages.flatMap((page) => page.rows) ?? []} keyExtractor={(item) => item.id} contentContainerStyle={styles.content}
    refreshing={reviews.isRefetching && !reviews.isFetchingNextPage} onRefresh={() => void reviews.refetch()}
    ListHeaderComponent={<View style={styles.header}><Text accessibilityRole="header" style={styles.title}>Değerlendirmeler</Text><Text style={styles.muted}>{context.data?.branch.name} · Doğrulanmış müşteri yorumları</Text>{reviews.isPending ? <LoadingState label="Değerlendirmeler yükleniyor..." /> : null}{reviews.isError ? <ErrorState onRetry={() => void reviews.refetch()} /> : null}</View>}
    renderItem={({ item }) => <View style={styles.card}><View style={styles.row}><Star color="#D89514" fill="#D89514" size={17} /><Text style={styles.rating}>{item.rating} / 5</Text><Text style={styles.status}>{statuses[item.moderation_status] ?? "İncelemede"}</Text></View><Text style={styles.comment}>{item.comment || "Yorum metni bırakılmadı."}</Text><Text style={styles.muted}>{formatDate(item.created_at)}</Text>{item.business_reply ? <View style={styles.reply}><Text style={styles.rating}>İşletme yanıtı</Text><Text style={styles.comment}>{item.business_reply}</Text></View> : null}</View>}
    ListEmptyComponent={!reviews.isPending && !reviews.isError ? <EmptyState title="Henüz değerlendirme yok" detail="Bu şubeye bırakılan doğrulanmış yorumlar burada görünecek." /> : null}
    ListFooterComponent={reviews.hasNextPage ? <AppButton label="Daha fazla değerlendirme" variant="secondary" busy={reviews.isFetchingNextPage} onPress={() => void reviews.fetchNextPage()} /> : null}
  />;
}
const styles = StyleSheet.create({
  content: { padding: 20, gap: 14, paddingBottom: 40 }, header: { gap: 7, marginBottom: 6 }, title: { color: theme.colors.text, fontSize: 25, fontWeight: "600" },
  muted: { color: theme.colors.muted, fontSize: 12, lineHeight: 19 }, card: { backgroundColor: "#fff", borderColor: theme.colors.border, borderWidth: 1, borderRadius: 18, padding: 18, gap: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 7 }, rating: { color: theme.colors.text, fontSize: 13, fontWeight: "500" }, status: { marginLeft: "auto", color: theme.colors.primary, backgroundColor: theme.colors.primarySoft, borderRadius: 8, padding: 6, fontSize: 11 },
  comment: { color: theme.colors.text, fontSize: 14, lineHeight: 22 }, reply: { backgroundColor: "#F8F7FC", padding: 12, borderRadius: 12, gap: 6 },
});
