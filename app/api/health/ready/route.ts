import { NextResponse } from "next/server";
import { createPublicSupabaseClientOptional } from "@/lib/supabase/public";

export const dynamic = "force-dynamic";

async function checkDatabase() {
  const supabase = createPublicSupabaseClientOptional();
  if (!supabase) return false;

  const { error } = await supabase
    .from("business_categories")
    .select("id")
    .limit(1)
    .abortSignal(AbortSignal.timeout(2_500));
  return !error;
}

async function checkDistributedRateLimit() {
  const url = process.env.UPSTASH_REDIS_REST_URL?.replace(/\/$/, "");
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return false;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(["PING"]),
      cache: "no-store",
      signal: AbortSignal.timeout(1_500),
    });
    if (!response.ok) return false;
    const payload = (await response.json()) as { result?: string };
    return payload.result === "PONG";
  } catch {
    return false;
  }
}

export async function GET() {
  const startedAt = performance.now();
  const databaseConfigured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const rateLimitConfigured = Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
  const [databaseReachable, rateLimitReachable] = await Promise.all([
    databaseConfigured ? checkDatabase() : Promise.resolve(false),
    rateLimitConfigured ? checkDistributedRateLimit() : Promise.resolve(false),
  ]);

  const rateLimitReady = process.env.NODE_ENV !== "production" || rateLimitReachable;
  const ready = databaseConfigured && databaseReachable && rateLimitReady;
  return NextResponse.json(
    {
      status: ready ? "ready" : "not_ready",
      checks: {
        database: databaseReachable ? "ok" : databaseConfigured ? "unreachable" : "not_configured",
        distributedRateLimit: rateLimitReachable
          ? "ok"
          : rateLimitConfigured
            ? "unreachable"
            : process.env.NODE_ENV === "production"
              ? "not_configured"
              : "optional_in_development",
      },
      durationMs: Math.round(performance.now() - startedAt),
      timestamp: new Date().toISOString(),
    },
    { status: ready ? 200 : 503, headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
