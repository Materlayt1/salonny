import type { Business } from "@salonny/contracts";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { AppButton, BrandHeader, EmptyState, ErrorState, LoadingState, Screen, SectionHeader } from "@/components/app-ui";
import { BusinessCard } from "@/components/business-card";
import { theme } from "@/constants/theme";
import { useAuth } from "@/providers/auth-provider";
import { useBusinessDirectory, useBusinessRail, useCategories } from "@/hooks/use-marketplace";
import { LinearGradient } from "expo-linear-gradient";
import { Bell, Search, Clock3, Star, Sparkles, ChevronRight } from "lucide-react-native";
import { CategoryIcon, categoryPalette } from "@/components/category-icon";
import { useQuery } from "@tanstack/react-query";
import { getHomeHighlights, type BusinessQuery } from "@/lib/api";
import { BusinessMap } from "@/components/business-map";
import { LocationAction } from "@/components/location-action";
import { useLocation } from "@/providers/location-provider";
import { useHydrated } from "@/hooks/use-hydrated";
import { BusinessFilterSheet, DirectorySearch } from "@/components/business-filters";
import { defaultBusinessFilters, filterCount, filterSummary, type BusinessFilters } from "@/lib/business-filters";
import { BusinessListSkeleton } from "@/components/business-list-skeleton";

function BusinessRail({ title, subtitle, businesses, sort = "recommended", loading = false }: {
  title: string;
  subtitle: string;
  businesses: Business[];
  sort?: BusinessQuery["sort"];
  loading?: boolean;
}) {
  if (loading) return <View><SectionHeader title={title} subtitle={subtitle} /><BusinessListSkeleton compact /></View>;
  if (!businesses.length) return null;
  return (
    <View>
      <View style={styles.railHeading}><View style={{ flex: 1 }}><SectionHeader title={title} subtitle={subtitle} /></View><Pressable accessibilityRole="button" accessibilityLabel={`${title} tümünü gör`} onPress={() => router.push({ pathname: "/discover", params: { sort, ...(sort === "nearest" ? { nearby: "1" } : {}) } })} style={styles.seeAll}><Text style={styles.seeAllText}>Tümünü gör</Text><ChevronRight size={13} color={theme.colors.primary} /></Pressable></View>
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
  const hydrated = useHydrated();
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [heroQuery, setHeroQuery] = useState("");
  const [mapOpen, setMapOpen] = useState(false);
  const [mapSelectedId, setMapSelectedId] = useState("");
  const location = useLocation();
  const highlights = useQuery({ queryKey: ["home-highlights"], queryFn: getHomeHighlights });
  const [category, setCategory] = useState("");
  const [city, setCity] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [openNow, setOpenNow] = useState(false);
  const [sort, setSort] = useState<BusinessFilters["sort"]>("recommended");
  const popular = useBusinessRail("popular", { sort: "rating" }, 10);
  const newest = useBusinessRail("newest", { sort: "newest" }, 10);
  const recommended = useBusinessRail("recommended", { sort: "recommended" }, 10);
  const nearest = useBusinessRail("nearby", location.position ? { sort: "nearest", lat: location.position.latitude, lng: location.position.longitude } : { sort: "recommended" }, 10, Boolean(location.position));
  const categories = useCategories();
  const directory = useBusinessDirectory({ q: query, category, city, open: openNow, sort, ...(sort === "nearest" && location.position ? { lat: location.position.latitude, lng: location.position.longitude } : {}) });
  const filters: BusinessFilters = { category, city, open: openNow, sort };
  const applyFilters = (values: BusinessFilters) => { setCategory(values.category); setCity(values.city); setSort(values.sort); setOpenNow(values.open); setFiltersOpen(false); };
  const resetFilters = () => { setQuery(""); applyFilters({ ...defaultBusinessFilters }); };
  const businesses = useMemo(
    () => directory.data?.pages.flatMap((page) => page.businesses) ?? [],
    [directory.data],
  );
  const refreshing = popular.isRefetching || newest.isRefetching || directory.isRefetching;
  const refresh = () => {
    void Promise.all([popular.refetch(), newest.refetch(), recommended.refetch(), highlights.refetch(), ...(location.position ? [nearest.refetch()] : []), categories.refetch(), directory.refetch()]);
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
            <TextInput editable={hydrated} accessibilityLabel="Hizmet, işletme veya kategori ara" value={heroQuery} onChangeText={setHeroQuery} placeholder="Hizmet, işletme veya kategori ara..." placeholderTextColor={theme.colors.muted} style={styles.heroSearchText} returnKeyType="search" onSubmitEditing={() => router.push({ pathname: "/discover", params: { q: heroQuery } })} />
            <Pressable disabled={!hydrated} accessibilityRole="button" onPress={() => router.push({ pathname: "/discover", params: { q: heroQuery } })} style={styles.searchButton}><Text style={styles.searchButtonText}>Ara</Text></Pressable>
          </View>
          <View style={styles.shortcuts}><Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/discover", params: { nearby: "1" } })} style={styles.shortcut}><Search size={16} color={theme.colors.primary} /><Text style={styles.shortcutText}>Yakınımdakiler</Text></Pressable><Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/discover", params: { open: "1" } })} style={styles.shortcut}><Clock3 size={16} color={theme.colors.primary} /><Text style={styles.shortcutText}>Şu an açık</Text></Pressable><Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/discover", params: { sort: "rating" } })} style={styles.shortcut}><Star size={16} color={theme.colors.primary} /><Text style={styles.shortcutText}>En yüksek puan</Text></Pressable><Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/discover", params: { sort: "price" } })} style={styles.shortcut}><Sparkles size={16} color={theme.colors.primary} /><Text style={styles.shortcutText}>Uygun fiyat</Text></Pressable></View>
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

        <BusinessRail title={location.position ? "Sana en yakın işletmeler" : "En popüler işletmeler"} subtitle={location.position ? "Yaklaşık konumuna göre sıralandı" : "Yüksek puanlı ve çok tercih edilenler"} businesses={(location.position ? nearest : popular).data?.businesses ?? []} loading={(location.position ? nearest : popular).isPending} sort={location.position ? "nearest" : "rating"} />
        {location.error ? <Text style={styles.locationError}>{location.error}</Text> : null}
        <View style={styles.mapBlock}><Text style={styles.mapEyebrow}>CANLI KEŞİF HARİTASI</Text><Text style={styles.mapTitle}>Çevrendeki seçenekleri tek bakışta gör.</Text><Text style={styles.heroText}>Gerçek işletme konumları. Bir noktaya dokun, işletmeyi seç ve ayrıntılara geç.</Text>{mapOpen ? <><BusinessMap items={recommended.data?.businesses ?? []} selectedId={mapSelectedId} onSelect={(business) => setMapSelectedId(business.id)} height={280} />{recommended.data?.businesses.find((business) => business.id === mapSelectedId) ? <BusinessCard compact business={recommended.data.businesses.find((business) => business.id === mapSelectedId)!} /> : null}<AppButton label="Haritada keşfet" variant="secondary" onPress={() => router.push({ pathname: "/discover", params: { map: "1" } })} /></> : <AppButton label="Haritayı aç" variant="secondary" onPress={() => setMapOpen(true)} />}<LocationAction label={location.position ? "Yakınındaki işletmeleri gör" : "Konumumu aç"} onGranted={() => router.push({ pathname: "/discover", params: { nearby: "1", map: "1" } })} /></View>
        {highlights.data?.services.length ? <View><SectionHeader title="Popüler hizmet ve kategoriler" subtitle="Aradığın hizmete doğrudan ulaş" /><View style={styles.serviceGrid}>{highlights.data.services.map((service) => <Pressable accessibilityRole="button" key={service.name} style={styles.serviceTile} onPress={() => router.push({ pathname: "/discover", params: { q: service.name } })}><Text style={styles.serviceName}>{service.name}</Text><Text style={styles.servicePrice}>{service.price.toLocaleString("tr-TR")} TL&apos;den başlayan</Text><ChevronRight size={17} color={theme.colors.primary} /></Pressable>)}</View></View> : null}
        <BusinessRail title="Yeni eklenen işletmeler" subtitle="Platforma yeni katılanları keşfet" businesses={newest.data?.businesses ?? []} loading={newest.isPending} sort="newest" />
        <BusinessRail title="En yüksek puanlılar" subtitle="Doğrulanmış değerlendirmelerde öne çıkanlar" businesses={(popular.data?.businesses ?? []).filter((business) => business.reviews > 0)} loading={popular.isPending} sort="rating" />
        {highlights.data?.reviews.length ? <View><SectionHeader title="Müşteriler ne diyor?" subtitle="Tamamlanan randevulardan gelen gerçek değerlendirmeler" /><FlatList horizontal data={highlights.data.reviews} keyExtractor={(review) => review.id} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail} ItemSeparatorComponent={() => <View style={{ width: 12 }} />} renderItem={({ item: review }) => <Pressable accessibilityRole="button" onPress={() => router.push(`/business/${review.businessSlug}`)} style={styles.reviewCard}><Text style={styles.reviewVerified}>Doğrulanmış</Text><Text style={styles.reviewStars}>{"★".repeat(review.rating)}</Text><Text numberOfLines={4} style={styles.reviewComment}>{review.comment}</Text><Text style={styles.serviceName}>{review.businessName}</Text><Text style={styles.servicePrice}>İşletmeye git →</Text></Pressable>} /></View> : null}

        <View style={styles.directoryHeader}>
          <SectionHeader title="Tüm işletmeler" subtitle="Filtrele, sırala ve sayfa sayfa keşfet" />
          <DirectorySearch label="İşletme ara" ready={hydrated} value={query} onChange={setQuery} onFilters={() => setFiltersOpen(true)} count={filterCount(filters)} />
          {filterCount(filters) ? <View style={styles.filterSummary}><Text style={styles.summaryText}>{filterSummary(filters, categories.data?.categories ?? [])}</Text><AppButton label="Temizle" variant="ghost" onPress={resetFilters} /></View> : null}
        </View>

        {directory.isLoading ? <BusinessListSkeleton /> : null}
        {directory.isError ? <ErrorState onRetry={() => void directory.refetch()} /> : null}
        </>}
        ListEmptyComponent={!directory.isLoading && !directory.isError ? <EmptyState title="Sonuç bulunamadı" detail="Aramanı genişletebilir veya filtreleri temizleyebilirsin." action={<AppButton label="Filtreleri temizle" variant="secondary" onPress={resetFilters} />} /> : null}
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
      {filtersOpen ? <BusinessFilterSheet value={filters} categories={categories.data?.categories ?? []} allowNearest={Boolean(location.position)} onApply={applyFilters} onClose={() => setFiltersOpen(false)} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 28 },
  accountButton: { backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  accountButtonText: { color: "#fff", fontSize: 12, fontWeight: theme.typography.weight.semibold },
  greeting: { color: theme.colors.text, fontSize: 16, fontWeight: "600", marginHorizontal: 20, marginTop: 8, marginBottom: 18 },
  hero: { gap: 10, paddingHorizontal: 20, paddingBottom: 16 },
  eyebrow: { color: "#DED5FF", fontSize: 11, fontWeight: theme.typography.weight.semibold, letterSpacing: 1.4 },
  heroTitle: { color: theme.colors.text, fontSize: 26, fontWeight: theme.typography.weight.semibold, letterSpacing: -0.8, lineHeight: 34 },
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
  mapBlock: { margin: 20, padding: 18, gap: 12, borderRadius: 24, backgroundColor: "#F7F5FF", borderWidth: 1, borderColor: "#E8E2F6" }, mapEyebrow: { color: theme.colors.primary, fontSize: 10, fontWeight: theme.typography.weight.semibold, letterSpacing: 1 }, mapTitle: { color: theme.colors.text, fontSize: 22, fontWeight: theme.typography.weight.semibold, letterSpacing: -0.5 }, locationError: { color: theme.colors.danger, fontSize: 12, marginHorizontal: 20 },
  serviceGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginHorizontal: 20 }, serviceTile: { width: "48%", padding: 16, gap: 8, backgroundColor: "#FAF9FF", borderRadius: 16, borderWidth: 1, borderColor: theme.colors.border }, serviceName: { color: theme.colors.text, fontSize: 13, fontWeight: "600" }, servicePrice: { color: theme.colors.muted, fontSize: 11 }, reviewCard: { width: 280, borderRadius: 20, borderWidth: 1, borderColor: theme.colors.border, padding: 20, gap: 12, backgroundColor: "#fff" }, reviewVerified: { color: theme.colors.success, fontSize: 10, fontWeight: "600" }, reviewStars: { color: "#E5A100", fontSize: 14 }, reviewComment: { color: theme.colors.text, fontSize: 13, lineHeight: 21, minHeight: 42 },
  directoryHeader: { marginTop: 10 },
  filterSummary: { marginHorizontal: 20, padding: 12, backgroundColor: "#FBFAFF", borderRadius: 12, flexDirection: "row", gap: 12, alignItems: "center" }, summaryText: { flex: 1, color: theme.colors.muted, fontSize: 12, lineHeight: 19 },
  input: { backgroundColor: "#fff", borderColor: theme.colors.border, borderRadius: theme.radius.md, borderWidth: 1, color: theme.colors.text, fontSize: 15, marginHorizontal: 20, paddingHorizontal: 16, paddingVertical: 14 },
  filterRow: { gap: 8, paddingHorizontal: 20, paddingTop: 12 },
  directoryItem: { paddingHorizontal: 20, paddingTop: 12 },
  loadMore: { paddingHorizontal: 20 },
  endText: { color: theme.colors.muted, fontSize: 13, padding: 18, textAlign: "center" },
});
