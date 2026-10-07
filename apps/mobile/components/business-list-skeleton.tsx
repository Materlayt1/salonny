import { StyleSheet, View } from "react-native";
import { theme } from "@/constants/theme";

/** Static placeholders respect reduced-motion users and never masquerade as data. */
export function BusinessListSkeleton({ compact = false }: { compact?: boolean }) {
  return <View accessible accessibilityRole="progressbar" accessibilityLabel="İşletmeler yükleniyor" accessibilityState={{ busy: true }} aria-busy testID="business-list-skeleton" style={[styles.list, compact && styles.rail]}>{[0, 1].map((key) => <View key={key} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.card, compact && styles.compact]}><View style={[styles.image, compact && styles.thumbnail]} /><View style={styles.details}><View style={[styles.line, { width: "75%", height: 18 }]} /><View style={[styles.line, { width: "45%" }]} /><View style={[styles.line, { width: "85%" }]} /><View style={[styles.line, { width: "55%" }]} /></View></View>)}</View>;
}
const styles = StyleSheet.create({ list: { gap: 14, padding: 20 }, rail: { flexDirection: "row", overflow: "hidden" }, card: { borderRadius: 20, borderWidth: 1, borderColor: theme.colors.border, overflow: "hidden", backgroundColor: "#fff" }, compact: { width: 290, flexDirection: "row", padding: 10, gap: 10 }, image: { width: "100%", aspectRatio: 2.05, backgroundColor: "#F0F0F5" }, thumbnail: { width: 100, height: 116, aspectRatio: undefined, borderRadius: 14 }, details: { padding: 16, gap: 12, flex: 1 }, line: { height: 12, borderRadius: 6, backgroundColor: "#F0F0F5" } });
