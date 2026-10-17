import { router } from "expo-router";
import { Bell } from "lucide-react-native";
import { Pressable, StyleSheet, Text } from "react-native";
import { theme } from "@/constants/theme";
import { useAuth } from "@/providers/auth-provider";
import { useNotificationSummary } from "@/hooks/use-notification-summary";

export function NotificationBell() {
  const { session } = useAuth();
  const summary = useNotificationSummary();
  const count = !summary.isError ? summary.data?.unreadCount : undefined;
  return <Pressable accessibilityRole="button" accessibilityLabel="Bildirimler" accessibilityHint={summary.isError ? "Bildirim sayısı güncellenemedi" : count ? `${count} okunmamış bildirim` : undefined} style={styles.button} onPress={() => router.push(session ? "/notifications" : "/auth")}>
    <Bell size={20} color={theme.colors.text} />
    {count ? <Text testID="notification-badge" accessibilityLabel={`${count} okunmamış bildirim`} style={styles.badge}>{count > 99 ? "99+" : count}</Text> : summary.isError && session ? <Text accessibilityLabel="Bildirim sayısı güncellenemedi" style={[styles.badge, styles.unknown]}>!</Text> : null}
  </Pressable>;
}
const styles = StyleSheet.create({
  button: { width: 40, height: 40, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#fff" },
  badge: { position: "absolute", right: -5, top: -5, minWidth: 19, paddingHorizontal: 4, height: 19, borderRadius: 10, overflow: "hidden", textAlign: "center", lineHeight: 19, backgroundColor: theme.colors.primary, color: "#fff", fontSize: 10, fontWeight: "600" },
  unknown: { backgroundColor: theme.colors.muted },
});
