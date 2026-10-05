import type { Business } from "@salonny/contracts";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { AppButton, BrandHeader, Chip, EmptyState, ErrorState, LoadingState, Screen, SectionHeader } from "@/components/app-ui";
import { BusinessCard } from "@/components/business-card";
import { theme } from "@/constants/theme";
import { useAuth } from "@/providers/auth-provider";
import { useBusinessDirectory, useBusinessRail, useCategories } from "@/hooks/use-marketplace";

const categoryGlyphs: Record<string, string> = {
  activity: "🧘",
  dog: "🐶",
  dumbbell: "🏋️",
  ellipsis: "•••",
  flower: "🌸",
  hand: "💅",
  paw: "🐾",
  razor: "🧔",
  scissors: "✂️",
  sparkles: "✨",
};

function categoryGlyph(icon: string) {
  return categoryGlyphs[icon.trim().toLowerCase()] ?? "✦";
}

function BusinessRail({ title, subtitle, businesses }: {
  title: string;
  subtitle: string;
  businesses: Business[];
}) {
  if (!businesses.length) return null;
  return (
    <View>
      <SectionHeader title={title} subtitle={subtitle} />
      <FlatList
        horizontal
        data={businesses}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <BusinessCard business={item} compact />}
        contentContainerStyle={styles.rail}
        ItemSeparatorComponent={() => <View style={{ width: 12 }} />}
        showsHorizontalScrollIndicator={false}
      />
    </View>
  );
}

export default function HomeScreen() {
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [openNow, setOpenNow] = useState(false);
  const [sort, setSort] = useState<"recommended" | "rating" | "newest">("recommended");
  const popular = useBusinessRail("popular", { sort: "rating" }, 10);
  const newest = useBusinessRail("newest", { sort: "newest" }, 10);
  const recommended = useBusinessRail("recommended", { sort: "recommended" }, 10);
  const categories = useCategories();
  const directory = useBusinessDirectory({ q: query, category, open: openNow, sort });
  const businesses = useMemo(
    () => directory.data?.pages.flatMap((page) => page.businesses) ?? [],
    [directory.data],
  );
  const refreshing = popular.isRefetching || newest.isRefetching || directory.isRefetching;
  const refresh = () => {
    void Promise.all([popular.refetch(), newest.refetch(), recommended.refetch(), categories.refetch(), directory.refetch()]);
  };

  return (
    <Screen>
      <FlatList
        data={businesses}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <View style={styles.directoryItem}><BusinessCard business={item} /></View>}
        initialNumToRender={4}
        maxToRenderPerBatch={6}
        windowSize={7}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.colors.primary} />}
        contentContainerStyle={styles.content}
        ListHeaderComponent={<>
        <BrandHeader right={(
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push(user ? "/profile" : "/auth")}
            style={styles.accountButton}
          >
            <Text style={styles.accountButtonText}>{user ? "Profilim" : "Giriş yap"}</Text>
          </Pressable>
        )} />

        <View style={styles.hero}>
          <Text style={styles.eyebrow}>SALONNY MOBİL</Text>
          <Text style={styles.heroTitle}>Kendine ayırdığın zaman şimdi daha yakın.</Text>
          <Text style={styles.heroText}>Gerçek işletmeleri keşfet, uygun saati seç ve randevunu birkaç dokunuşta oluştur.</Text>
          <Pressable onPress={() => router.push("/discover")} style={styles.heroSearch}>
            <Text style={styles.searchIcon}>⌕</Text>
            <Text style={styles.heroSearchText}>İşletme veya hizmet ara</Text>
          </Pressable>
        </View>

        <SectionHeader title="Kategoriler" subtitle="Aradığın hizmete hızlıca ulaş" />
        {categories.isLoading ? <LoadingState label="Kategoriler hazırlanıyor..." /> : (
          <FlatList
            horizontal
            data={categories.data?.categories ?? []}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.categoryRail}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => {
                  setCategory(item.id);
                  router.push({ pathname: "/discover", params: { category: item.id } });
                }}
                style={styles.categoryCard}
              >
                <Text style={styles.categoryIcon}>{categoryGlyph(item.icon)}</Text>
                <Text numberOfLines={2} style={styles.categoryName}>{item.name}</Text>
              </Pressable>
            )}
            ItemSeparatorComponent={() => <View style={{ width: 10 }} />}
            showsHorizontalScrollIndicator={false}
          />
        )}

        <BusinessRail title="En popüler işletmeler" subtitle="Yüksek puanlı ve çok tercih edilenler" businesses={popular.data?.businesses ?? []} />
        <BusinessRail title="Öne çıkan işletmeler" subtitle="Salonny'de keşfetmeye değer işletmeler" businesses={recommended.data?.businesses ?? []} />
        <BusinessRail title="Yeni eklenen işletmeler" subtitle="Platforma yeni katılanları keşfet" businesses={newest.data?.businesses ?? []} />

        <View style={styles.directoryHeader}>
          <SectionHeader title="Tüm işletmeler" subtitle="Filtrele, sırala ve sayfa sayfa keşfet" />
          <TextInput
            accessibilityLabel="İşletme ara"
            autoCapitalize="none"
            onChangeText={setQuery}
            placeholder="İşletme veya hizmet ara"
            placeholderTextColor={theme.colors.muted}
            style={styles.input}
            value={query}
          />
          <ScrollView horizontal contentContainerStyle={styles.filterRow} showsHorizontalScrollIndicator={false}>
            <Chip label="Tümü" selected={!category} onPress={() => setCategory("")} />
            {(categories.data?.categories ?? []).map((item) => (
              <Chip key={item.id} label={item.name} selected={category === item.id} onPress={() => setCategory(item.id)} />
            ))}
          </ScrollView>
          <ScrollView horizontal contentContainerStyle={styles.filterRow} showsHorizontalScrollIndicator={false}>
            <Chip label="Önerilen" selected={sort === "recommended"} onPress={() => setSort("recommended")} />
            <Chip label="En yüksek puan" selected={sort === "rating"} onPress={() => setSort("rating")} />
            <Chip label="En yeniler" selected={sort === "newest"} onPress={() => setSort("newest")} />
            <Chip label="Şu an açık" selected={openNow} onPress={() => setOpenNow((value) => !value)} />
          </ScrollView>
        </View>

        {directory.isLoading ? <LoadingState label="İşletmeler getiriliyor..." /> : null}
        {directory.isError ? <ErrorState onRetry={() => void directory.refetch()} /> : null}
        </>}
        ListEmptyComponent={!directory.isLoading && !directory.isError ? <EmptyState title="Sonuç bulunamadı" detail="Farklı bir kategori veya arama deneyebilirsin." /> : null}
        ListFooterComponent={directory.hasNextPage ? (
          <View style={styles.loadMore}>
            <AppButton
              label="Daha fazla işletme getir"
              busy={directory.isFetchingNextPage}
              variant="secondary"
              onPress={() => void directory.fetchNextPage()}
            />
          </View>
        ) : businesses.length ? <Text style={styles.endText}>Tüm sonuçları gördün.</Text> : null}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 28 },
  accountButton: { backgroundColor: theme.colors.text, borderRadius: theme.radius.pill, paddingHorizontal: 16, paddingVertical: 10 },
  accountButtonText: { color: "#fff", fontSize: 12, fontWeight: "800" },
  hero: { backgroundColor: theme.colors.primary, borderRadius: 28, gap: 10, marginHorizontal: 16, marginTop: 6, padding: 24 },
  eyebrow: { color: "#DED5FF", fontSize: 11, fontWeight: "900", letterSpacing: 1.4 },
  heroTitle: { color: "#fff", fontSize: 29, fontWeight: "900", letterSpacing: -0.8, lineHeight: 34 },
  heroText: { color: "#EFEAFF", fontSize: 14, lineHeight: 21 },
  heroSearch: { alignItems: "center", backgroundColor: "#fff", borderRadius: theme.radius.md, flexDirection: "row", gap: 10, marginTop: 8, padding: 15 },
  searchIcon: { color: theme.colors.text, fontSize: 22 },
  heroSearchText: { color: theme.colors.muted, fontSize: 14 },
  categoryRail: { paddingHorizontal: 20, paddingBottom: 4 },
  categoryCard: { alignItems: "center", backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: 18, borderWidth: 1, gap: 8, padding: 14, width: 102 },
  categoryIcon: { fontSize: 26 },
  categoryName: { color: theme.colors.text, fontSize: 12, fontWeight: "700", textAlign: "center" },
  rail: { paddingHorizontal: 20, paddingBottom: 8 },
  directoryHeader: { marginTop: 10 },
  input: { backgroundColor: "#fff", borderColor: theme.colors.border, borderRadius: theme.radius.md, borderWidth: 1, color: theme.colors.text, fontSize: 15, marginHorizontal: 20, paddingHorizontal: 16, paddingVertical: 14 },
  filterRow: { gap: 8, paddingHorizontal: 20, paddingTop: 12 },
  directoryItem: { paddingHorizontal: 20, paddingTop: 12 },
  loadMore: { paddingHorizontal: 20 },
  endText: { color: theme.colors.muted, fontSize: 13, padding: 18, textAlign: "center" },
});
