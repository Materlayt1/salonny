import "react-native-url-polyfill/auto";

import { AppState, Platform } from "react-native";
import { createClient } from "@supabase/supabase-js";
import { authStorage } from "@/lib/secure-storage";
import { config, isAuthConfigured } from "@/lib/config";

export const supabase = isAuthConfigured
  ? createClient(config.supabaseUrl, config.supabasePublishableKey, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: false,
        persistSession: true,
        storage: authStorage,
      },
    })
  : null;

if (supabase && Platform.OS !== "web") {
  AppState.addEventListener("change", (state) => {
    if (state === "active") supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
