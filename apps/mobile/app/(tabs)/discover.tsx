import { useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import {
  RefreshControl,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { AppButton, BrandHeader, Chip, EmptyState, ErrorState, LoadingState, Screen } from "@/components/app-ui";
import { BusinessCard } from "@/components/business-card";
import { theme } from "@/constants/theme";
import { useBusinessDirectory, useCategories } from "@/hooks/use-marketplace";

export default function DiscoverScreen() {
  const params = useLocalSearchParams<{ category?: string; q?: string; open?: string; sort?: string }>();
  return <DiscoverContent key={JSON.stringify(params)} params={params} />;
}
function DiscoverContent({ params }: { params: { category?: string; q?: string; open?: string; sort?: string } }) {
  const [query, setQuery] = useState(params.q ?? "");
  const [city, setCity] = useState("");
  const [categorySelection, setCategorySelection] = useState<{ source: string; value: string } | null>(null);
  const categorySource = params.category ?? "";
  const category = categorySelection?.source === categorySource ? categorySelection.value : categorySource;
  const setCategory = (value: string) => setCategorySelection({ source: categorySource, value });
  const [openNow, setOpenNow] = useState(params.open === "1");
  const [sort, setSort] = useState<"recommended" | "rating" | "newest" | "name">(params.sort === "rating" || params.sort === "newest" || params.sort === "name" ? params.sort : "recommended");
  const categories = useCategories();
  const directory = useBusinessDirectory({ q: query, city, category, open: openNow, sort });
  const businesses = useMemo(
    () => directory.data?.pages.flatMap((page) => page.businesses) ?? [],
    [directory.data],
  );

  return (
    <Screen>
      <BrandHeader />
      <FlatList
        data={businesses} keyExtractor={(item) => item.id}
        renderItem={({ item }) => <View style={styles.list}><BusinessCard business={item} /></View>}
        initialNumToRender={6} maxToRenderPerBatch={6} windowSize={7}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={directory.isRefetching} onRefresh={() => void directory.refetch()} tintColor={theme.colors.primary} />}
        contentContainerStyle={styles.content}
        ListHeaderComponent={<>
        <View style={styles.intro}>
          <Text style={styles.title}>Keşfet</Text>
          <Text style={styles.subtitle}>Binlerce işletme arasından sana uygun olanı bul.</Text>
        </View>
        <View style={styles.searchGroup}>
          <TextInput
            accessibilityLabel="İşletme veya hizmet ara"
            onChangeText={setQuery}
            placeholder="İşletme veya hizmet ara"
            placeholderTextColor={theme.colors.muted}
            style={styles.input}
            value={query}
          />
          <TextInput
            accessibilityLabel="Şehir"
            autoCapitalize="words"
            onChangeText={setCity}
            placeholder="Şehir"
            placeholderTextColor={theme.colors.muted}
            style={styles.cityInput}
            value={city}
          />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Chip label="Tümü" selected={!category} onPress={() => setCategory("")} />
          {(categories.data?.categories ?? []).map((item) => (
            <Chip key={item.id} label={item.name} selected={category === item.id} onPress={() => setCategory(item.id)} />
          ))}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Chip label="Önerilen" selected={sort === "recommended"} onPress={() => setSort("recommended")} />
          <Chip label="Puana göre" selected={sort === "rating"} onPress={() => setSort("rating")} />
          <Chip label="En yeniler" selected={sort === "newest"} onPress={() => setSort("newest")} />
          <Chip label="A-Z" selected={sort === "name"} onPress={() => setSort("name")} />
          <Chip label="Şu an açık" selected={openNow} onPress={() => setOpenNow((value) => !value)} />
        </ScrollView>

        <View style={styles.resultHeader}>
          <Text style={styles.resultTitle}>İşletmeler</Text>
          <Text style={styles.resultCount}>{directory.data?.pages[0]?.total ?? 0} sonuç</Text>
        </View>
        {directory.isLoading ? <LoadingState label="Sonuçlar hazırlanıyor..." /> : null}
        {directory.isError ? <ErrorState onRetry={() => void directory.refetch()} /> : null}
        </>}
        ListEmptyComponent={!directory.isLoading && !directory.isError && !businesses.length ? (
          <EmptyState icon="⌕" title="Sonuç bulunamadı" detail="Filtrelerini değiştirerek yeniden deneyebilirsin." />
        ) : null}
        ListFooterComponent={directory.hasNextPage ? (
          <View style={styles.loadMore}>
            <AppButton label="Daha fazla göster" variant="secondary" busy={directory.isFetchingNextPage} onPress={() => void directory.fetchNextPage()} />
          </View>
        ) : null}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 28 },
  intro: { paddingHorizontal: 20, paddingBottom: 14, paddingTop: 8 },
  title: { color: theme.colors.text, fontSize: 26, fontWeight: "700", letterSpacing: -0.8 },
  subtitle: { color: theme.colors.muted, fontSize: 14, lineHeight: 21, marginTop: 4 },
  searchGroup: { flexDirection: "row", gap: 9, paddingHorizontal: 20 },
  input: { backgroundColor: "#fff", borderColor: theme.colors.border, borderRadius: theme.radius.md, borderWidth: 1, color: theme.colors.text, flex: 1, paddingHorizontal: 15, paddingVertical: 14 },
  cityInput: { backgroundColor: "#fff", borderColor: theme.colors.border, borderRadius: theme.radius.md, borderWidth: 1, color: theme.colors.text, paddingHorizontal: 13, width: 105 },
  chips: { gap: 8, paddingHorizontal: 20, paddingTop: 12 },
  resultHeader: { alignItems: "baseline", flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 12, paddingTop: 24 },
  resultTitle: { color: theme.colors.text, fontSize: 20, fontWeight: "800" },
  resultCount: { color: theme.colors.muted, fontSize: 13 },
  list: { paddingHorizontal: 20, paddingBottom: 14 },
  loadMore: { paddingHorizontal: 20 },
});
