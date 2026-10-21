import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { AppButton, BrandHeader, EmptyState, ErrorState, LoadingState, Screen } from "@/components/app-ui";
import { BusinessCard } from "@/components/business-card";
import { theme } from "@/constants/theme";
import { listFavorites } from "@/lib/api";
import { useAuth } from "@/providers/auth-provider";

export default function FavoritesScreen() {
  const { session, loading } = useAuth();
  const favorites = useQuery({
    queryKey: ["favorites", session?.user.id],
    queryFn: () => listFavorites(session!.access_token),
    enabled: Boolean(session?.access_token),
  });

  if (loading) return <Screen><LoadingState label="Favorilerin hazırlanıyor..." /></Screen>;
  if (!session) {
    return (
      <Screen>
        <BrandHeader />
        <EmptyState
          icon="♡"
          title="Favorilerini kaydet"
          detail="Beğendiğin işletmelere daha sonra hızlıca ulaşmak için giriş yap."
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
        refreshControl={<RefreshControl refreshing={favorites.isRefetching} onRefresh={() => void favorites.refetch()} tintColor={theme.colors.primary} />}
      >
        <View style={styles.intro}>
          <Text style={styles.title}>Favorilerim</Text>
          <Text style={styles.subtitle}>Kaydettiğin işletmeler tek yerde.</Text>
        </View>
        {favorites.isLoading ? <LoadingState /> : null}
        {favorites.isError ? <ErrorState onRetry={() => void favorites.refetch()} /> : null}
        {!favorites.isLoading && !favorites.isError && !favorites.data?.length ? (
          <EmptyState
            icon="♡"
            title="Henüz favorin yok"
            detail="İşletme detayındaki kalp simgesinden favorilerine ekleyebilirsin."
            action={<AppButton label="Keşfet" variant="secondary" onPress={() => router.push("/discover")} />}
          />
        ) : null}
        <View style={styles.list}>
          {(favorites.data ?? []).map((business) => <BusinessCard key={business.id} business={business} />)}
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 28 },
  intro: { paddingHorizontal: 20, paddingVertical: 10 },
  title: { color: theme.colors.text, fontSize: 26, fontWeight: theme.typography.weight.semibold, letterSpacing: -0.8 },
  subtitle: { color: theme.colors.muted, fontSize: 14, marginTop: 4 },
  list: { padding: 20, gap: 12 },
});
