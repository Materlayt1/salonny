import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useState, useRef } from "react";
import { Heart, Plus, BadgeCheck, Share2 } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Share } from "react-native";
import { config } from "@/lib/config";
import {
  FlatList,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { AppButton, ErrorState, LoadingState, Screen, SectionHeader } from "@/components/app-ui";
import { theme } from "@/constants/theme";
import { useBusiness } from "@/hooks/use-marketplace";
import { getSessionSummary, setFavorite } from "@/lib/api";
import { useAuth } from "@/providers/auth-provider";
import { Alert } from "@/lib/alert";

export default function BusinessDetailScreen() {
  const insets = useSafeAreaInsets();
  const scroll = useRef<ScrollView>(null);
  const sections = useRef<Record<string, number>>({});
  const [activeTab, setActiveTab] = useState("services");
  const { slug = "" } = useLocalSearchParams<{ slug: string }>();
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const business = useBusiness(slug);
  const summary = useQuery({
    queryKey: ["session-summary", session?.user.id],
    queryFn: ({ signal }) => getSessionSummary(session!.access_token, signal),
    enabled: Boolean(session?.access_token),
  });
  const [favoriteOverride, setFavoriteOverride] = useState<boolean | null>(null);
  const serverFavorite = Boolean(
    summary.data?.authenticated
    && business.data
    && summary.data.favoriteBusinessIds.includes(business.data.id),
  );
  const favorite = favoriteOverride ?? serverFavorite;

  const favoriteMutation = useMutation({
    mutationFn: async () => {
      if (!session || !business.data) throw new Error("Giriş yapmalısın.");
      const next = !favorite;
      await setFavorite(business.data.id, next, session.access_token);
      return next;
    },
    onSuccess: (next) => {
      setFavoriteOverride(next);
      void queryClient.invalidateQueries({ queryKey: ["favorites"] });
      void queryClient.invalidateQueries({ queryKey: ["session-summary"] });
    },
    onError: (error) => Alert.alert("Favori güncellenemedi", error.message),
  });

  if (business.isLoading) return <Screen><LoadingState label="İşletme hazırlanıyor..." /></Screen>;
  if (business.isError || !business.data) return <Screen><ErrorState onRetry={() => void business.refetch()} /></Screen>;
  const item = business.data;

  const toggleFavorite = () => {
    if (!session) {
      router.push("/auth");
      return;
    }
    favoriteMutation.mutate();
  };

  return (
    <Screen>
      <ScrollView ref={scroll} contentContainerStyle={styles.content}>
        <View style={styles.heroWrap}>
          <Image alt={`${item.name} kapak fotoğrafı`} source={{ uri: item.image }} style={styles.hero} />
          <Pressable disabled={favoriteMutation.isPending} accessibilityRole="button" accessibilityLabel={favorite ? "Favorilerden çıkar" : "Favorilere ekle"} onPress={toggleFavorite} style={styles.favorite}>
            <Heart size={22} color={theme.colors.primary} fill={favorite ? theme.colors.primary : "transparent"} />
          </Pressable>
        </View>
          <View style={styles.heroOverlay}>
            <View style={styles.titleRow}>
              <Text style={styles.title}>{item.name}</Text>
              {item.verified ? <BadgeCheck size={22} color={theme.colors.primary} /> : null}
            </View>
            <Text style={styles.heroMeta}>{item.category} · {item.district}, {item.city}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="İşletmeyi paylaş" style={styles.share} onPress={() => void Share.share({ message: `${item.name} — ${config.apiUrl}/business/${item.slug}` }).catch(() => Alert.alert("Paylaşılamadı", "Yeniden deneyebilirsin."))}><Share2 size={17} color={theme.colors.primary} /><Text style={styles.shareText}>Paylaş</Text></Pressable>
          </View>

        <View style={styles.quickFacts}>
          <View style={styles.fact}><Text style={styles.factValue}>{item.reviews ? `★ ${item.rating.toFixed(1)}` : "Yeni"}</Text><Text style={styles.factLabel}>{item.reviews} yorum</Text></View>
          <View style={styles.divider} />
          <View style={styles.fact}><Text style={item.open ? styles.openValue : styles.closedValue}>{item.open ? "Açık" : "Kapalı"}</Text><Text style={styles.factLabel}>{item.nextAvailable}</Text></View>
          <View style={styles.divider} />
          <View style={styles.fact}><Text style={styles.factValue}>{item.startingPrice > 0 ? `${item.startingPrice.toLocaleString("tr-TR")} ₺+` : "Fiyatı gör"}</Text><Text style={styles.factLabel}>Başlangıç</Text></View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>{[{ id: "services", label: "Hizmetler" }, { id: "reviews", label: `Yorumlar (${item.reviews})` }, { id: "employees", label: "Çalışanlar" }, { id: "about", label: "Hakkında" }].map((tab) => <Pressable key={tab.id} accessibilityRole="button" accessibilityState={{ selected: activeTab === tab.id }} onPress={() => { setActiveTab(tab.id); scroll.current?.scrollTo({ y: sections.current[tab.id] ?? 0, animated: true }); }} style={[styles.tab, activeTab === tab.id && styles.activeTab]}><Text style={[styles.tabText, activeTab === tab.id && { color: theme.colors.primary }]}>{tab.label}</Text></Pressable>)}</ScrollView>

        {item.gallery.length > 1 ? (
          <View>
            <SectionHeader title="Fotoğraflar" />
            <FlatList horizontal data={item.gallery} keyExtractor={(image, index) => `${image}-${index}`} contentContainerStyle={styles.gallery} showsHorizontalScrollIndicator={false} renderItem={({ item: image, index }) => <Image alt={`${item.name} galeri fotoğrafı ${index + 1}`} source={{ uri: image }} style={styles.galleryImage} />} ItemSeparatorComponent={() => <View style={{ width: 10 }} />} />
          </View>
        ) : null}

        <View onLayout={(event) => { sections.current.services = event.nativeEvent.layout.y; }} style={styles.section}>
          <Text style={styles.sectionTitle}>Hizmetler</Text>
          <View style={styles.serviceList}>
            {item.services.map((service) => (
              <View key={service.id} style={styles.serviceRow}>
                <View style={styles.serviceText}><Text style={styles.serviceName}>{service.name}</Text><Text numberOfLines={2} style={styles.serviceDetail}>{service.duration} dk{service.description ? ` · ${service.description}` : ""}</Text></View>
                <Text style={styles.servicePrice}>{service.price.toLocaleString("tr-TR")} ₺</Text>
                <Pressable accessibilityRole="button" accessibilityLabel={`${service.name} seç`} style={styles.selectService} onPress={() => router.push({ pathname: "/booking/[slug]", params: { slug: item.slug, service: service.id } })}><Plus size={18} color="#fff" /></Pressable>
              </View>
            ))}
          </View>
        </View>

        <View onLayout={(event) => { sections.current.employees = event.nativeEvent.layout.y; }} style={styles.section}><Text style={styles.sectionTitle}>Uzmanlar</Text>{item.employees.length ? item.employees.map((employee) => <View key={employee.id} style={styles.employee}><Image alt={`${employee.name} profil fotoğrafı`} source={{ uri: employee.avatar || item.image }} style={styles.employeeAvatar} /><View style={{ flex: 1 }}><Text style={styles.serviceName}>{employee.name}</Text><Text style={styles.serviceDetail}>{employee.role}</Text><Text style={styles.serviceDetail}>{employee.services.length} hizmet</Text></View></View>) : <Text style={styles.description}>Ekip bilgileri yakında eklenecek.</Text>}</View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>İletişim ve konum</Text>
          <Text style={styles.address}>{item.address}</Text>
          <View style={styles.actionRow}>
            {item.phone ? <View style={styles.actionFlex}><AppButton label="Ara" variant="secondary" onPress={() => void Linking.openURL(`tel:${item.phone}`)} /></View> : null}
            <View style={styles.actionFlex}><AppButton label="Yol tarifi" variant="ghost" onPress={() => void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${item.lat},${item.lng}`)} /></View>
          </View>
        </View>

        <View onLayout={(event) => { sections.current.reviews = event.nativeEvent.layout.y; }} style={styles.section}>
            <Text style={styles.sectionTitle}>Değerlendirmeler</Text>
            {item.reviewItems?.length ? item.reviewItems.slice(0, 20).map((review) => (
              <View key={review.id} style={styles.review}><Text style={styles.reviewRating}>{"★".repeat(review.rating)}</Text><Text style={styles.reviewText}>{review.comment || "Değerlendirme bırakıldı."}</Text>{review.businessReply ? <Text style={styles.reply}>İşletme: {review.businessReply}</Text> : null}</View>
            )) : <Text style={styles.description}>Henüz doğrulanmış değerlendirme yok. Yorumlar yalnız tamamlanan randevulardan alınır.</Text>}
          </View>
        <View onLayout={(event) => { sections.current.about = event.nativeEvent.layout.y; }} style={styles.section}><Text style={styles.sectionTitle}>Hakkında</Text><Text style={styles.description}>{item.description || `${item.name}, ${item.district} bölgesinde ${item.category.toLocaleLowerCase("tr-TR")} hizmetleri sunar.`}</Text><Text style={styles.sectionTitle}>Çalışma saatleri</Text>{["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"].map((day, weekday) => { const hours = item.hours?.find((hour) => hour.weekday === weekday); return <View key={day} style={styles.hoursRow}><Text style={styles.description}>{day}</Text><Text style={styles.serviceName}>{!hours || hours.closed ? "Kapalı" : `${hours.opensAt?.slice(0, 5)}–${hours.closesAt?.slice(0, 5)}`}</Text></View>; })}</View>
      </ScrollView>
      <View style={[styles.bookingBar, { paddingBottom: Math.max(insets.bottom, 18) }]}>
        <View style={styles.bookingButton}>{item.services.length && item.employees.length && item.branchId ? <AppButton label="Randevu al" onPress={() => router.push(`/booking/${item.slug}`)} /> : <Text style={styles.description}>Online randevu henüz hazır değil</Text>}</View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 106 },
  heroWrap: { height: 240, position: "relative", marginHorizontal: 16, borderRadius: 20, overflow: "hidden", marginTop: 8 },
  hero: { height: "100%", width: "100%" },
  heroOverlay: { padding: 20, backgroundColor: "#fff", gap: 4 },
  titleRow: { alignItems: "center", flexDirection: "row", gap: 8 },
  title: { color: theme.colors.text, flex: 1, fontSize: 26, fontWeight: "700", letterSpacing: -0.6 },
  verified: { backgroundColor: "#fff", borderRadius: 10, color: theme.colors.primary, fontSize: 10, fontWeight: "900", overflow: "hidden", paddingHorizontal: 8, paddingVertical: 5 },
  heroMeta: { color: theme.colors.muted, fontSize: 13, marginTop: 5 },
  share: { flexDirection: "row", gap: 6, alignItems: "center", marginTop: 10 }, shareText: { color: theme.colors.primary, fontSize: 12, fontWeight: "600" },
  tabs: { paddingHorizontal: 20, gap: 24, borderBottomWidth: 1, borderBottomColor: theme.colors.border }, tab: { paddingVertical: 16, borderBottomWidth: 2, borderBottomColor: "transparent" }, activeTab: { borderBottomColor: theme.colors.primary }, tabText: { color: theme.colors.text, fontSize: 13, fontWeight: "600" },
  employee: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 8 }, employeeAvatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: theme.colors.primarySoft }, hoursRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 3 }, selectService: { width: 32, height: 32, borderRadius: 16, backgroundColor: theme.colors.primary, alignItems: "center", justifyContent: "center" },
  favorite: { alignItems: "center", backgroundColor: "#fff", borderRadius: 24, height: 48, justifyContent: "center", position: "absolute", right: 16, top: 16, width: 48, ...theme.shadow },
  favoriteText: { color: theme.colors.primary, fontSize: 27, lineHeight: 29 },
  quickFacts: { alignItems: "center", backgroundColor: "#fff", borderBottomColor: theme.colors.border, borderBottomWidth: 1, flexDirection: "row", paddingVertical: 18 },
  fact: { alignItems: "center", flex: 1, gap: 3 },
  factValue: { color: theme.colors.text, fontSize: 14, fontWeight: "900" },
  openValue: { color: theme.colors.success, fontSize: 14, fontWeight: "900" },
  closedValue: { color: theme.colors.muted, fontSize: 14, fontWeight: "900" },
  factLabel: { color: theme.colors.muted, fontSize: 10 },
  divider: { backgroundColor: theme.colors.border, height: 30, width: 1 },
  section: { backgroundColor: "#fff", borderColor: theme.colors.border, borderRadius: theme.radius.lg, borderWidth: 1, gap: 12, marginHorizontal: 20, marginTop: 18, padding: 18 },
  sectionTitle: { color: theme.colors.text, fontSize: 20, fontWeight: "700" },
  description: { color: theme.colors.muted, fontSize: 14, lineHeight: 22 },
  gallery: { paddingHorizontal: 20 },
  galleryImage: { backgroundColor: theme.colors.primarySoft, borderRadius: 18, height: 150, width: 220 },
  serviceList: { gap: 0 },
  serviceRow: { alignItems: "center", borderBottomColor: theme.colors.border, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", gap: 12, paddingVertical: 13 },
  serviceText: { flex: 1, gap: 4 },
  serviceName: { color: theme.colors.text, fontSize: 14, fontWeight: "800" },
  serviceDetail: { color: theme.colors.muted, fontSize: 11, lineHeight: 16 },
  servicePrice: { color: theme.colors.primaryDark, fontSize: 14, fontWeight: "900" },
  address: { color: theme.colors.muted, fontSize: 13, lineHeight: 20 },
  actionRow: { flexDirection: "row", gap: 10 },
  actionFlex: { flex: 1 },
  review: { borderTopColor: theme.colors.border, borderTopWidth: StyleSheet.hairlineWidth, gap: 5, paddingTop: 12 },
  reviewRating: { color: "#E5A100", fontSize: 13 },
  reviewText: { color: theme.colors.text, fontSize: 13, lineHeight: 19 },
  reply: { backgroundColor: theme.colors.background, borderRadius: 10, color: theme.colors.muted, fontSize: 11, lineHeight: 17, padding: 10 },
  bookingBar: { alignItems: "center", backgroundColor: "#fff", borderTopColor: theme.colors.border, borderTopWidth: 1, bottom: 0, flexDirection: "row", gap: 16, left: 0, paddingBottom: 18, paddingHorizontal: 20, paddingTop: 12, position: "absolute", right: 0 },
  bookingFrom: { color: theme.colors.muted, fontSize: 10 },
  bookingPrice: { color: theme.colors.text, fontSize: 18, fontWeight: "900" },
  bookingButton: { flex: 1 },
});
