import { Image, StyleSheet, Text, View } from "react-native";
import salonnyMark from "@/assets/images/salonny-mark.png";
export function BrandLogo({ compact = false, size = 40 }: { compact?: boolean; size?: number }) {
  return <View accessibilityLabel="Salonny logosu" style={styles.row}><Image accessibilityLabel="Salonny marka simgesi" alt="Salonny logosu" resizeMode="contain" source={salonnyMark} style={{ width: size, height: size, borderRadius: size * .3 }} />{!compact && <Text style={[styles.wordmark, { fontSize: size * .65 }]}>salonny</Text>}</View>;
}
const styles = StyleSheet.create({ row: { flexDirection: "row", alignItems: "center", gap: 10 }, wordmark: { color: "#5C3DE2", fontWeight: "700", letterSpacing: -1 } });
