import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createServerClientOptional } from "@/lib/supabase/server";

const bearerPattern = /^Bearer\s+([A-Za-z0-9._~-]+)$/;

/**
 * Uses the regular cookie session for the web app and a validated bearer
 * session for native clients. The public key is safe to ship; authorization is
 * still enforced by Supabase Auth and database RLS.
 */
export async function createRequestClientOptional(
  request: Request,
): Promise<SupabaseClient | null> {
  const authorization = request.headers.get("authorization")?.trim();
  if (!authorization) return createServerClientOptional();
  if (authorization.length > 8_192 || !bearerPattern.test(authorization)) return null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (
    process.env.NEXT_PUBLIC_SUPABASE_OFFLINE === "true"
    || !url
    || !key
  ) return null;

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    global: { headers: { Authorization: authorization } },
  });
}
