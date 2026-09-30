import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import type { SupportedStorage } from "@supabase/supabase-js";

const chunkSize = 1_800;
const countKey = (key: string) => `${key}.chunks`;
const chunkKey = (key: string, index: number) => `${key}.${index}`;

async function removeNativeValue(key: string) {
  const rawCount = await SecureStore.getItemAsync(countKey(key));
  const count = Math.max(0, Number(rawCount ?? 0));
  await Promise.all([
    SecureStore.deleteItemAsync(key),
    SecureStore.deleteItemAsync(countKey(key)),
    ...Array.from({ length: count }, (_, index) =>
      SecureStore.deleteItemAsync(chunkKey(key, index))),
  ]);
}

const nativeStorage: SupportedStorage = {
  async getItem(key) {
    const rawCount = await SecureStore.getItemAsync(countKey(key));
    const count = Math.max(0, Number(rawCount ?? 0));
    if (!count) return SecureStore.getItemAsync(key);
    const chunks = await Promise.all(
      Array.from({ length: count }, (_, index) =>
        SecureStore.getItemAsync(chunkKey(key, index))),
    );
    return chunks.every((chunk) => chunk !== null) ? chunks.join("") : null;
  },
  async setItem(key, value) {
    await removeNativeValue(key);
    if (value.length <= chunkSize) {
      await SecureStore.setItemAsync(key, value);
      return;
    }
    const chunks = value.match(new RegExp(`.{1,${chunkSize}}`, "gs")) ?? [];
    await Promise.all(chunks.map((chunk, index) =>
      SecureStore.setItemAsync(chunkKey(key, index), chunk)));
    await SecureStore.setItemAsync(countKey(key), String(chunks.length));
  },
  removeItem: removeNativeValue,
};

const webStorage: SupportedStorage = {
  getItem: (key) => globalThis.localStorage?.getItem(key) ?? null,
  setItem: (key, value) => globalThis.localStorage?.setItem(key, value),
  removeItem: (key) => globalThis.localStorage?.removeItem(key),
};

export const authStorage = Platform.OS === "web" ? webStorage : nativeStorage;
