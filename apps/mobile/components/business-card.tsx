import type { Business } from "@salonny/contracts";
import { router } from "expo-router";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { theme } from "@/constants/theme";

export function BusinessCard({ business, compact = false }: { business: Business; compact?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${business.name} işletmesini aç`}
      onPress={() => router.push(`/business/${business.slug}`)}
      style={({ pressed }) => [
        styles.card,
        compact && styles.compactCard,
        pressed && styles.pressed,
      ]}
    >
      <Image alt={`${business.name} kapak fotoğrafı`} source={{ uri: business.image }} style={[styles.image, compact && styles.compactImage]} />
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text numberOfLines={1} style={styles.title}>{business.name}</Text>
          {business.verified ? <Text accessibilityLabel="Onaylı işletme" style={styles.verified}>✓</Text> : null}
        </View>
        <Text numberOfLines={1} style={styles.meta}>{business.category} · {business.district}</Text>
        <View style={styles.footer}>
          <Text style={styles.rating}>★ {business.rating.toFixed(1)} <Text style={styles.reviewCount}>({business.reviews})</Text></Text>
          <Text style={business.open ? styles.open : styles.closed}>{business.open ? "Açık" : "Kapalı"}</Text>
          <Text style={styles.price}>{business.startingPrice.toLocaleString("tr-TR")} ₺+</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    marginBottom: 14,
    overflow: "hidden",
    ...theme.shadow,
  },
  compactCard: { marginBottom: 2, width: 276 },
  pressed: { opacity: 0.92, transform: [{ scale: 0.99 }] },
  image: { backgroundColor: theme.colors.primarySoft, height: 176, width: "100%" },
  compactImage: { height: 148 },
  body: { gap: 6, padding: 14 },
  titleRow: { alignItems: "center", flexDirection: "row", gap: 6 },
  title: { color: theme.colors.text, flex: 1, fontSize: 17, fontWeight: "800" },
  verified: {
    backgroundColor: theme.colors.primary,
    borderRadius: 10,
    color: "#fff",
    fontSize: 11,
    fontWeight: "900",
    overflow: "hidden",
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  meta: { color: theme.colors.muted, fontSize: 13 },
  footer: { alignItems: "center", flexDirection: "row", gap: 10, marginTop: 4 },
  rating: { color: theme.colors.text, fontSize: 13, fontWeight: "800" },
  reviewCount: { color: theme.colors.muted, fontWeight: "500" },
  open: { color: theme.colors.success, fontSize: 12, fontWeight: "800" },
  closed: { color: theme.colors.muted, fontSize: 12, fontWeight: "700" },
  price: { color: theme.colors.primaryDark, fontSize: 13, fontWeight: "800", marginLeft: "auto" },
});
