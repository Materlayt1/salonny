import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const SERVER_REQUEST_TIMEOUT_MS = 2_000;

function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit) {
  const target = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  // The complete report RPC has its own 12s budget. A cookie-based SSR client
  // must not silently shorten that to the ordinary 2s metadata request limit.
  const path = new URL(target).pathname;
  const timeoutSignal = AbortSignal.timeout(path.startsWith("/auth/v1/") || path === "/rest/v1/rpc/native_business_report" ? 12_000 : SERVER_REQUEST_TIMEOUT_MS);
  const signal = init?.signal ? AbortSignal.any([init.signal, timeoutSignal]) : timeoutSignal;
  return fetch(input, { ...init, signal });
}

export function hasSupabaseConfig() {
  return process.env.NEXT_PUBLIC_SUPABASE_OFFLINE !== "true"
    && Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export async function createServerClientOptional() {
  if (!hasSupabaseConfig()) return null;
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { fetch: fetchWithTimeout },
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } catch { /* Server Components cannot persist refreshed cookies. */ }
        },
      },
    },
  );
}

export async function requireUser() {
  const supabase = await createServerClientOptional();
  if (!supabase) return null;
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}
