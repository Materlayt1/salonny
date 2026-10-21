import { Tabs, router } from "expo-router";
import { CalendarDays, CalendarPlus, Compass, Home, UserRound } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { theme } from "@/constants/theme";

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  return <Tabs screenOptions={{ headerShown: false, tabBarHideOnKeyboard: true, tabBarActiveTintColor: theme.colors.primary, tabBarInactiveTintColor: theme.colors.muted, tabBarLabelStyle: styles.label, tabBarStyle: { ...styles.bar, height: 70 + insets.bottom, paddingBottom: insets.bottom + 6 } }}>
    <Tabs.Screen name="index" options={{ title: "Ana Sayfa", tabBarIcon: ({ color }) => <Home size={20} color={color} /> }} />
    <Tabs.Screen name="discover" options={{ title: "Keşfet", tabBarIcon: ({ color }) => <Compass size={20} color={color} /> }} />
    <Tabs.Screen name="booking-action" options={{ title: "Randevu al", tabBarButton: () => <Pressable accessibilityRole="button" accessibilityLabel="Randevu al" onPress={() => router.navigate("/discover")} style={styles.action}><View style={styles.actionIcon}><CalendarPlus size={20} color="#fff" /></View><Text style={styles.actionText}>Randevu al</Text></Pressable> }} />
    <Tabs.Screen name="appointments" options={{ title: "Randevular", tabBarIcon: ({ color }) => <CalendarDays size={20} color={color} /> }} />
    <Tabs.Screen name="profile" options={{ title: "Profilim", tabBarIcon: ({ color }) => <UserRound size={20} color={color} /> }} />
    <Tabs.Screen name="favorites" options={{ href: null }} />
  </Tabs>;
}
const styles = StyleSheet.create({ bar: { backgroundColor: "#fff", borderTopColor: theme.colors.border, paddingTop: 9 }, label: { fontSize: 10, fontWeight: "500" }, action: { flex: 1, alignItems: "center", gap: 5, marginTop: -8 }, actionIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.colors.primary, alignItems: "center", justifyContent: "center", ...theme.shadow }, actionText: { color: theme.colors.primary, fontSize: 10, fontWeight: "600" } });
