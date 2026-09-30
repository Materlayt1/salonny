"use client";

import { createBrowserClient } from "@supabase/ssr";

export function createBrowserSupabaseClient() {
  if (process.env.NEXT_PUBLIC_SUPABASE_OFFLINE === "true") return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createBrowserClient(url, key, {
    auth: {
      // Development sessions should not create an endless refresh loop when a
      // remote project is paused, deleted, or temporarily unreachable.
      autoRefreshToken: process.env.NODE_ENV === "production",
    },
  });
}
