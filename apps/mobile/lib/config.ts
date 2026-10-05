import Constants from "expo-constants";
import { Platform } from "react-native";

const trimSlash = (value: string) => value.replace(/\/+$/, "");

const developmentHost = Constants.expoConfig?.hostUri?.split(":")[0];
const developmentApi = Platform.OS !== "web" && developmentHost
  ? `http://${developmentHost}:3001`
  : "http://localhost:3001";

export const config = {
  apiUrl: trimSlash(process.env.EXPO_PUBLIC_API_URL ?? (__DEV__ ? developmentApi : "")),
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() ?? "",
  supabasePublishableKey:
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim()
    ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim()
    ?? "",
};

export const isAuthConfigured = Boolean(
  config.supabaseUrl && config.supabasePublishableKey,
);

export function absoluteAssetUrl(value: string | null | undefined) {
  if (!value) return `${config.apiUrl}/brand/salonny-mark.png`;
  if (/^https?:\/\//i.test(value)) return value;
  return `${config.apiUrl}${value.startsWith("/") ? value : `/${value}`}`;
}
