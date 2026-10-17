import { focusManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type PropsWithChildren } from "react";
import { AppState, Platform } from "react-native";
import { AuthProvider } from "@/providers/auth-provider";
import { ApiError } from "@/lib/api";
import { LocationProvider } from "@/providers/location-provider";
import { BrowseAreaProvider } from "@/providers/browse-area-provider";

export function AppProviders({ children }: PropsWithChildren) {
  useEffect(() => {
    if (Platform.OS === "web") return; // Preserve TanStack's browser visibility listener.
    focusManager.setFocused(AppState.currentState === "active");
    const subscription = AppState.addEventListener("change", (state) => focusManager.setFocused(state === "active"));
    return () => { subscription.remove(); focusManager.setFocused(undefined); };
  }, []);
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        gcTime: 10 * 60_000,
        retry: (count, error) => !(error instanceof ApiError && [400, 401, 403, 404, 422].includes(error.status)) && count < 2,
        staleTime: 60_000,
      },
      mutations: { retry: 0 },
    },
  }));
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider><LocationProvider><BrowseAreaProvider>{children}</BrowseAreaProvider></LocationProvider></AuthProvider>
    </QueryClientProvider>
  );
}
