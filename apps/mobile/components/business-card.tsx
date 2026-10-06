import type { Business } from "@salonny/contracts";
import { router } from "expo-router";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { theme } from "@/constants/theme";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Heart, Star, MapPin, BadgeCheck, Clock3 } from "lucide-react-native";
import { useWindowDimensions } from "react-native";
import { useAuth } from "@/providers/auth-provider";
import { getSessionSummary, setFavorite } from "@/lib/api";
import { Alert } from "@/lib/alert";

export function BusinessCard({ business, compact = false }: { business: Business; compact?: boolean }) {
  const { width } = useWindowDimensions();
  const { user, session } = useAuth();
  const queryClient = useQueryClient();
  const summary = useQuery({ queryKey: ["session-summary", user?.id], queryFn: ({ signal }) => getSessionSummary(session!.access_token, signal), enabled: Boolean(session) });
  const favorite = Boolean(summary.data?.authenticated && summary.data.favoriteBusinessIds.includes(business.id));
  const mutation = useMutation({ mutationFn: () => setFavorite(business.id, !favorite, session!.access_token), onSuccess: async () => { await Promise.all([queryClient.invalidateQueries({ queryKey: ["session-summary"] }), queryClient.invalidateQueries({ queryKey: ["favorites"] })]); }, onError: (error) => Alert.alert("Kaydedilemedi", error.message) });
  return (
    <View style={[styles.card, compact && { width: Math.min(width * 0.86, 390) }]}>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${business.name} işletmesini aç`}
      onPress={() => router.push(`/business/${business.slug}`)}
      style={({ pressed }) => [
        compact && styles.compactCard,
        pressed && styles.pressed,
      ]}
    >
      <View style={compact ? styles.compactCover : styles.cover}>
        <Image alt={`${business.name} kapak fotoğrafı`} source={{ uri: business.image }} style={styles.image} />
        {business.sponsored ? <Text style={styles.sponsored}>Sponsorlu</Text> : null}
      </View>
      <View style={[styles.body, compact && styles.compactBody]}>
        <View style={styles.titleRow}>
          <Text numberOfLines={1} style={[styles.title, compact && { fontSize: 14 }]}>{business.name}</Text>
          {business.verified ? <BadgeCheck accessibilityLabel="Onaylı işletme" color={theme.colors.primary} size={16} /> : null}
        </View>
        <Text numberOfLines={1} style={styles.category}>{business.category}</Text>
        <View style={styles.metaRow}><Star size={12} fill="#F5B426" color="#F5B426" /><Text style={styles.rating}>{business.reviews ? business.rating.toFixed(1) : "Yeni"}</Text><Text style={styles.meta}>{business.reviews ? `(${business.reviews} değerlendirme)` : "Henüz değerlendirme yok"}</Text></View>
        <View style={styles.metaRow}><MapPin size={12} color={theme.colors.muted} /><Text numberOfLines={1} style={styles.meta}>{business.district}{business.distance !== null ? ` · ≈ ${business.distance.toFixed(1)} km` : ""}</Text></View>
        <View style={styles.footer}>
          <View style={styles.availability}><Clock3 size={11} color={theme.colors.primary} /><Text numberOfLines={1} style={styles.availabilityText}>{business.nextAvailable}</Text></View>
          <Text style={styles.price}>{business.startingPrice > 0 ? `${business.startingPrice.toLocaleString("tr-TR")} ₺+` : "Fiyatı gör"}</Text>
        </View>
      </View>
    </Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel={favorite ? `${business.name} favorilerden çıkar` : `${business.name} favorilere ekle`} disabled={mutation.isPending} onPress={() => { if (!session) router.push("/auth"); else mutation.mutate(); }} style={[styles.favorite, compact && { left: 88, right: undefined, top: 17 }]}><Heart size={17} color={favorite ? theme.colors.primary : "#3B3447"} fill={favorite ? theme.colors.primary : "transparent"} /></Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E6E1F2",
    overflow: "hidden",
  },
  compactCard: { flexDirection: "row", padding: 10, gap: 10, minHeight: 136 },
  pressed: { opacity: 0.92, transform: [{ scale: 0.99 }] },
  cover: { aspectRatio: 2.05, width: "100%", backgroundColor: theme.colors.primarySoft, overflow: "hidden" },
  compactCover: { height: 116, width: 108, borderRadius: 14, overflow: "hidden", backgroundColor: theme.colors.primarySoft },
  image: { width: "100%", height: "100%", resizeMode: "cover" },
  compactBody: { flex: 1, padding: 0, gap: 5, justifyContent: "center" },
  category: { color: theme.colors.muted, fontSize: 11 },
  metaRow: { alignItems: "center", flexDirection: "row", gap: 4 },
  availability: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: theme.colors.primarySoft, borderRadius: 6, padding: 5, flexShrink: 1 },
  availabilityText: { color: theme.colors.primary, fontSize: 9, flexShrink: 1 },
  favorite: { position: "absolute", right: 7, top: 7, width: 29, height: 29, borderRadius: 15, backgroundColor: "#FFFFFFED", alignItems: "center", justifyContent: "center" },
  sponsored: { position: "absolute", left: 8, bottom: 8, color: "#fff", backgroundColor: "#0008", padding: 4, borderRadius: 6, fontSize: 9 },
  compactImage: { height: 148 },
  body: { gap: 7, padding: 16 },
  titleRow: { alignItems: "center", flexDirection: "row", gap: 6 },
  title: { color: theme.colors.text, flex: 1, fontSize: 17, lineHeight: 23, fontWeight: theme.typography.weight.semibold },
  verified: {
    backgroundColor: theme.colors.primary,
    borderRadius: 10,
    color: "#fff",
    fontSize: 11,
    fontWeight: theme.typography.weight.semibold,
    overflow: "hidden",
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  meta: { color: theme.colors.muted, fontSize: 10, flexShrink: 1 },
  footer: { alignItems: "center", flexDirection: "row", gap: 4, marginTop: 3, justifyContent: "space-between" },
  rating: { color: theme.colors.text, fontSize: 11, fontWeight: theme.typography.weight.semibold },
  reviewCount: { color: theme.colors.muted, fontWeight: "500" },
  open: { color: theme.colors.success, fontSize: 12, fontWeight: theme.typography.weight.semibold },
  closed: { color: theme.colors.muted, fontSize: 12, fontWeight: theme.typography.weight.medium },
  price: { color: theme.colors.text, fontSize: 11, fontWeight: theme.typography.weight.semibold },
});
