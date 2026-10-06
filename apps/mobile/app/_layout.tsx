import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import "react-native-reanimated";
import { theme } from "@/constants/theme";
import { AppProviders } from "@/providers/app-providers";

export { ErrorBoundary } from "expo-router";

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  useEffect(() => {
    void SplashScreen.hideAsync();
  }, []);

  return (
    <AppProviders>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          animation: "slide_from_right",
          contentStyle: { backgroundColor: theme.colors.background },
          headerBackButtonDisplayMode: "minimal",
          headerShadowVisible: false,
          headerStyle: { backgroundColor: theme.colors.background },
          headerTintColor: theme.colors.text,
          headerTitleStyle: { fontWeight: theme.typography.weight.semibold },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="manage" options={{ headerShown: false }} />
        <Stack.Screen name="business/[slug]" options={{ title: "İşletme" }} />
        <Stack.Screen name="booking/[slug]" options={{ title: "Randevu al" }} />
        <Stack.Screen name="appointment/[id]" options={{ title: "Randevun" }} />
        <Stack.Screen name="profile-edit" options={{ title: "Kişisel bilgiler" }} />
        <Stack.Screen name="notifications" options={{ title: "Bildirimler" }} />
        <Stack.Screen name="auth" options={{ presentation: "modal", title: "Salonny hesabı" }} />
      </Stack>
    </AppProviders>
  );
}
