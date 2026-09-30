import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const SERVER_REQUEST_TIMEOUT_MS = 2_000;

function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit) {
  const timeoutSignal = AbortSignal.timeout(SERVER_REQUEST_TIMEOUT_MS);
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
