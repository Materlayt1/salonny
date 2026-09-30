import { Tabs } from "expo-router";
import { StyleSheet, Text, View, type ColorValue } from "react-native";
import { theme } from "@/constants/theme";

const icons: Record<string, string> = {
  index: "⌂",
  discover: "⌕",
  appointments: "◷",
  favorites: "♡",
  profile: "○",
};

function TabIcon({ name, color, focused }: { name: string; color: ColorValue; focused: boolean }) {
  return (
    <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
      <Text style={[styles.icon, { color }]}>{icons[name]}</Text>
    </View>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.muted,
        tabBarHideOnKeyboard: true,
        tabBarIcon: ({ color, focused }) => (
          <TabIcon name={route.name} color={color} focused={focused} />
        ),
        tabBarLabelStyle: styles.label,
        tabBarStyle: styles.bar,
      })}
    >
      <Tabs.Screen name="index" options={{ title: "Ana Sayfa" }} />
      <Tabs.Screen name="discover" options={{ title: "Keşfet" }} />
      <Tabs.Screen name="appointments" options={{ title: "Randevular" }} />
      <Tabs.Screen name="favorites" options={{ title: "Favoriler" }} />
      <Tabs.Screen name="profile" options={{ title: "Profilim" }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: "#fff",
    borderTopColor: theme.colors.border,
    height: 76,
    paddingBottom: 10,
    paddingTop: 7,
  },
  label: { fontSize: 10, fontWeight: "700" },
  iconWrap: { alignItems: "center", borderRadius: 16, height: 28, justifyContent: "center", width: 42 },
  iconWrapActive: { backgroundColor: theme.colors.primarySoft },
  icon: { fontSize: 23, fontWeight: "700", lineHeight: 26 },
});
