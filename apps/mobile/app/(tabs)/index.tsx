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
import { LinearGradient } from "expo-linear-gradient";
import { Bell, Search, Clock3, Star, Sparkles, ChevronRight } from "lucide-react-native";
import { CategoryIcon, categoryPalette } from "@/components/category-icon";

function BusinessRail({ title, subtitle, businesses }: {
  title: string;
  subtitle: string;
  businesses: Business[];
}) {
  if (!businesses.length) return null;
  return (
    <View>
      <View style={styles.railHeading}><View style={{ flex: 1 }}><SectionHeader title={title} subtitle={subtitle} /></View><Pressable accessibilityLabel={`${title} tümünü gör`} onPress={() => router.push({ pathname: "/discover", params: { sort: title.includes("popüler") ? "rating" : title.includes("Yeni") ? "newest" : "recommended" } })} style={styles.seeAll}><Text style={styles.seeAllText}>Tümünü gör</Text><ChevronRight size={13} color={theme.colors.primary} /></Pressable></View>
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
  const [heroQuery, setHeroQuery] = useState("");
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
          <Pressable accessibilityRole="button" accessibilityLabel="Bildirimler" onPress={() => router.push(user ? "/notifications" : "/auth")} style={styles.accountButton}><Bell size={19} color={theme.colors.text} /></Pressable>
        )} />

        <Text style={styles.greeting}>Merhaba{user ? `, ${String(user.user_metadata.full_name ?? "").split(" ")[0] || "hoş geldin"}` : ""} 👋</Text>
        <LinearGradient colors={["#FFFFFF", "#FBFAFF"]} style={styles.hero}>
          <Text style={styles.heroTitle}>Bugün neye ihtiyacın var?</Text>
          <Text style={styles.heroText}>Kuaför, berber, güzellik, veteriner ve daha fazlasını keşfet; sana uygun randevuyu kolayca oluştur.</Text>
          <View style={styles.heroSearch}>
            <Search size={18} color={theme.colors.muted} />
            <TextInput accessibilityLabel="Hizmet, işletme veya kategori ara" value={heroQuery} onChangeText={setHeroQuery} placeholder="Hizmet, işletme veya kategori ara..." placeholderTextColor={theme.colors.muted} style={styles.heroSearchText} returnKeyType="search" onSubmitEditing={() => router.push({ pathname: "/discover", params: { q: heroQuery } })} />
            <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/discover", params: { q: heroQuery } })} style={styles.searchButton}><Text style={styles.searchButtonText}>Ara</Text></Pressable>
          </View>
          <View style={styles.shortcuts}><Pressable onPress={() => router.push({ pathname: "/discover", params: { open: "1" } })} style={styles.shortcut}><Clock3 size={16} color={theme.colors.primary} /><Text style={styles.shortcutText}>Şu an açık</Text></Pressable><Pressable onPress={() => router.push({ pathname: "/discover", params: { sort: "rating" } })} style={styles.shortcut}><Star size={16} color={theme.colors.primary} /><Text style={styles.shortcutText}>En yüksek puan</Text></Pressable><Pressable onPress={() => router.push({ pathname: "/discover", params: { sort: "newest" } })} style={styles.shortcut}><Sparkles size={16} color={theme.colors.primary} /><Text style={styles.shortcutText}>Yeni eklenenler</Text></Pressable><Pressable onPress={() => router.push("/discover")} style={styles.shortcut}><Search size={16} color={theme.colors.primary} /><Text style={styles.shortcutText}>Tümünü keşfet</Text></Pressable></View>
        </LinearGradient>

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
                <View style={[styles.categoryIcon, { backgroundColor: categoryPalette(item.icon)[0] }]}><CategoryIcon icon={item.icon} /></View>
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
  accountButton: { backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  accountButtonText: { color: "#fff", fontSize: 12, fontWeight: "800" },
  greeting: { color: theme.colors.text, fontSize: 16, fontWeight: "600", marginHorizontal: 20, marginTop: 8, marginBottom: 18 },
  hero: { gap: 10, paddingHorizontal: 20, paddingBottom: 16 },
  eyebrow: { color: "#DED5FF", fontSize: 11, fontWeight: "900", letterSpacing: 1.4 },
  heroTitle: { color: theme.colors.text, fontSize: 26, fontWeight: "700", letterSpacing: -0.8, lineHeight: 34 },
  heroText: { color: theme.colors.muted, fontSize: 13, lineHeight: 24 },
  heroSearch: { alignItems: "center", backgroundColor: "#fff", borderColor: "#DFDFE7", borderWidth: 1, borderRadius: 12, flexDirection: "row", gap: 8, marginTop: 8, paddingLeft: 12, paddingRight: 5, minHeight: 52 },
  searchIcon: { color: theme.colors.text, fontSize: 22 },
  heroSearchText: { color: theme.colors.text, fontSize: 11, flex: 1, paddingVertical: 12 },
  searchButton: { backgroundColor: theme.colors.primary, paddingHorizontal: 15, paddingVertical: 11, borderRadius: 8 }, searchButtonText: { color: "#fff", fontWeight: "600", fontSize: 12 },
  shortcuts: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 }, shortcut: { width: "48%", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, minHeight: 40, borderWidth: 1, borderColor: "#E8E2F6", backgroundColor: "#fff", borderRadius: 10 }, shortcutText: { color: theme.colors.text, fontSize: 11, fontWeight: "500" },
  categoryRail: { paddingHorizontal: 20, paddingBottom: 4 },
  categoryCard: { alignItems: "center", gap: 8, width: 70 },
  categoryIcon: { width: 58, height: 58, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  categoryName: { color: theme.colors.text, fontSize: 11, fontWeight: "500", textAlign: "center" },
  railHeading: { flexDirection: "row", alignItems: "center" }, seeAll: { flexDirection: "row", alignItems: "center", paddingRight: 20, paddingTop: 10, gap: 3 }, seeAllText: { color: theme.colors.primary, fontSize: 11, fontWeight: "600" },
  rail: { paddingHorizontal: 20, paddingBottom: 8 },
  directoryHeader: { marginTop: 10 },
  input: { backgroundColor: "#fff", borderColor: theme.colors.border, borderRadius: theme.radius.md, borderWidth: 1, color: theme.colors.text, fontSize: 15, marginHorizontal: 20, paddingHorizontal: 16, paddingVertical: 14 },
  filterRow: { gap: 8, paddingHorizontal: 20, paddingTop: 12 },
  directoryItem: { paddingHorizontal: 20, paddingTop: 12 },
  loadMore: { paddingHorizontal: 20 },
  endText: { color: theme.colors.muted, fontSize: 13, padding: 18, textAlign: "center" },
});
