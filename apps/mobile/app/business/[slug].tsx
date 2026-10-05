import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
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
  const { slug = "" } = useLocalSearchParams<{ slug: string }>();
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const business = useBusiness(slug);
  const summary = useQuery({
    queryKey: ["session-summary", session?.user.id],
    queryFn: () => getSessionSummary(session!.access_token),
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
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.heroWrap}>
          <Image alt={`${item.name} kapak fotoğrafı`} source={{ uri: item.image }} style={styles.hero} />
          <Pressable disabled={favoriteMutation.isPending} accessibilityRole="button" accessibilityLabel={favorite ? "Favorilerden çıkar" : "Favorilere ekle"} onPress={toggleFavorite} style={styles.favorite}>
            <Text style={styles.favoriteText}>{favorite ? "♥" : "♡"}</Text>
          </Pressable>
          <View style={styles.heroOverlay}>
            <View style={styles.titleRow}>
              <Text style={styles.title}>{item.name}</Text>
              {item.verified ? <Text style={styles.verified}>✓ Onaylı</Text> : null}
            </View>
            <Text style={styles.heroMeta}>{item.category} · {item.district}, {item.city}</Text>
          </View>
        </View>

        <View style={styles.quickFacts}>
          <View style={styles.fact}><Text style={styles.factValue}>★ {item.rating.toFixed(1)}</Text><Text style={styles.factLabel}>{item.reviews} yorum</Text></View>
          <View style={styles.divider} />
          <View style={styles.fact}><Text style={item.open ? styles.openValue : styles.closedValue}>{item.open ? "Açık" : "Kapalı"}</Text><Text style={styles.factLabel}>{item.nextAvailable}</Text></View>
          <View style={styles.divider} />
          <View style={styles.fact}><Text style={styles.factValue}>{item.startingPrice.toLocaleString("tr-TR")} ₺+</Text><Text style={styles.factLabel}>Başlangıç</Text></View>
        </View>

        {item.description ? (
          <View style={styles.section}><Text style={styles.sectionTitle}>Hakkında</Text><Text style={styles.description}>{item.description}</Text></View>
        ) : null}

        {item.gallery.length > 1 ? (
          <View>
            <SectionHeader title="Fotoğraflar" />
            <FlatList horizontal data={item.gallery} keyExtractor={(image, index) => `${image}-${index}`} contentContainerStyle={styles.gallery} showsHorizontalScrollIndicator={false} renderItem={({ item: image, index }) => <Image alt={`${item.name} galeri fotoğrafı ${index + 1}`} source={{ uri: image }} style={styles.galleryImage} />} ItemSeparatorComponent={() => <View style={{ width: 10 }} />} />
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Hizmetler</Text>
          <View style={styles.serviceList}>
            {item.services.map((service) => (
              <View key={service.id} style={styles.serviceRow}>
                <View style={styles.serviceText}><Text style={styles.serviceName}>{service.name}</Text><Text numberOfLines={2} style={styles.serviceDetail}>{service.duration} dk{service.description ? ` · ${service.description}` : ""}</Text></View>
                <Text style={styles.servicePrice}>{service.price.toLocaleString("tr-TR")} ₺</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>İletişim ve konum</Text>
          <Text style={styles.address}>{item.address}</Text>
          <View style={styles.actionRow}>
            {item.phone ? <View style={styles.actionFlex}><AppButton label="Ara" variant="secondary" onPress={() => void Linking.openURL(`tel:${item.phone}`)} /></View> : null}
            <View style={styles.actionFlex}><AppButton label="Yol tarifi" variant="ghost" onPress={() => void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${item.lat},${item.lng}`)} /></View>
          </View>
        </View>

        {item.reviewItems?.length ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Değerlendirmeler</Text>
            {item.reviewItems.slice(0, 5).map((review) => (
              <View key={review.id} style={styles.review}><Text style={styles.reviewRating}>{"★".repeat(review.rating)}</Text><Text style={styles.reviewText}>{review.comment || "Değerlendirme bırakıldı."}</Text>{review.businessReply ? <Text style={styles.reply}>İşletme: {review.businessReply}</Text> : null}</View>
            ))}
          </View>
        ) : null}
      </ScrollView>
      <View style={styles.bookingBar}>
        <View><Text style={styles.bookingFrom}>Başlangıç</Text><Text style={styles.bookingPrice}>{item.startingPrice.toLocaleString("tr-TR")} ₺</Text></View>
        <View style={styles.bookingButton}><AppButton label="Randevu al" onPress={() => router.push(`/booking/${item.slug}`)} /></View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 106 },
  heroWrap: { height: 310, position: "relative" },
  hero: { height: "100%", width: "100%" },
  heroOverlay: { backgroundColor: theme.colors.overlay, bottom: 0, left: 0, padding: 20, position: "absolute", right: 0 },
  titleRow: { alignItems: "center", flexDirection: "row", gap: 8 },
  title: { color: "#fff", flex: 1, fontSize: 26, fontWeight: "900", letterSpacing: -0.6 },
  verified: { backgroundColor: "#fff", borderRadius: 10, color: theme.colors.primary, fontSize: 10, fontWeight: "900", overflow: "hidden", paddingHorizontal: 8, paddingVertical: 5 },
  heroMeta: { color: "#EEEAFB", fontSize: 13, marginTop: 5 },
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
  sectionTitle: { color: theme.colors.text, fontSize: 18, fontWeight: "900" },
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
