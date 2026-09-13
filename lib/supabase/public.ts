import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const PUBLIC_REQUEST_TIMEOUT_MS = 2_000;
type PublicClient = SupabaseClient;
let publicClient: PublicClient | null | undefined;

function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit) {
  const timeoutSignal = AbortSignal.timeout(PUBLIC_REQUEST_TIMEOUT_MS);
  const signal = init?.signal ? AbortSignal.any([init.signal, timeoutSignal]) : timeoutSignal;
  return fetch(input, { ...init, signal });
}

export function createPublicSupabaseClientOptional() {
  if (publicClient !== undefined) return publicClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    publicClient = null;
    return publicClient;
  }
  publicClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: fetchWithTimeout },
  });
  return publicClient;
}

export async function awaitPublicRequest<T>(request: PromiseLike<T>, timeoutMs = PUBLIC_REQUEST_TIMEOUT_MS): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), timeoutMs);
  });
  try {
    return await Promise.race([Promise.resolve(request), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
