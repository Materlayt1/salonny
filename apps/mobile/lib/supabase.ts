import "react-native-url-polyfill/auto";

import { AppState, Platform } from "react-native";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { authStorage } from "@/lib/secure-storage";
import { config } from "@/lib/config";

export let supabase: SupabaseClient | null = null;
let initialization: Promise<SupabaseClient> | null = null;

export function initializeSupabase(): Promise<SupabaseClient> {
  if (supabase) return Promise.resolve(supabase);
  if (initialization) return initialization;
  initialization = (async () => {
    let url = config.supabaseUrl;
    let key = config.supabasePublishableKey;
    if (!url || !key) {
      if (!config.apiUrl) throw new Error("Uygulama sunucusu yapılandırılmamış.");
      const response = await fetch(`${config.apiUrl}/api/mobile/config`, { signal: AbortSignal.timeout(12_000) });
      if (!response.ok) throw new Error("Giriş servisine şu anda ulaşılamıyor.");
      const publicConfig = await response.json() as { url: string; publishableKey: string };
      url = publicConfig.url;
      key = publicConfig.publishableKey;
    }
    const upstreamOrigin = new URL(url).origin;
    supabase = createClient(url, key, {
      auth: { autoRefreshToken: true, detectSessionInUrl: false, persistSession: true, storage: authStorage },
      global: {
        fetch: (input, init) => {
          const target = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
          const apiTarget = target.origin === upstreamOrigin && target.pathname.startsWith("/auth/v1/")
            ? `${config.apiUrl}/api/auth/supabase/${target.pathname.slice("/auth/v1/".length)}${target.search}`
            : input;
          return fetch(apiTarget, { ...init, signal: AbortSignal.timeout(15_000) });
        },
      },
    });
    if (Platform.OS !== "web") {
      AppState.addEventListener("change", (state) => {
        if (state === "active") supabase?.auth.startAutoRefresh();
        else supabase?.auth.stopAutoRefresh();
      });
    }
    return supabase;
  })().catch((error) => { initialization = null; throw error; });
  return initialization;
}
