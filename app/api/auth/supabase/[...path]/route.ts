import { NextResponse } from "next/server";
import { apiRateLimit, readBoundedJson, validateMutationOrigin } from "@/lib/api-security";
import { emitEvent } from "@/lib/observability";

const routes: Record<string, string[]> = {
  token: ["POST"], signup: ["POST"], logout: ["POST"],
  user: ["GET", "PUT"], recover: ["POST"], resend: ["POST"],
  verify: ["POST"], settings: ["GET"], health: ["GET"],
};

const apiVersionHeader = "x-supabase-api-version";
const validApiVersion = (value: string) => /^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value);

function authError(message: string, code: string, status: number, headers?: HeadersInit) {
  // Both Supabase error formats are supported. Retryable 5xx errors are still
  // identified by status by auth-js; never turn a service failure into a 400.
  const responseHeaders = new Headers(headers);
  responseHeaders.set("Cache-Control", "private, no-store");
  return NextResponse.json({ code, error_code: code, error: message, msg: message }, {
    status, headers: responseHeaders,
  });
}

async function authGuard(response: Response, code: string) {
  const data = await response.json().catch(() => null) as { error?: unknown } | null;
  return authError(typeof data?.error === "string" ? data.error : "Kimlik isteği tamamlanamadı.", code, response.status, response.headers);
}

function reportAuthFailure(endpoint: string, status: number, code: string, stage: "rate_limit" | "configuration" | "upstream" | "connection") {
  // Never log credentials, tokens, authorization headers, identifiers or raw
  // provider errors. These fields are sufficient to distinguish local gates.
  void emitEvent("warn", { event: "auth_proxy_rejected", endpoint, status, code, stage });
}

async function handle(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const endpoint = path.join("/");
  if (path.length !== 1 || !routes[endpoint]?.includes(request.method)) {
    return authError("Desteklenmeyen kimlik işlemi.", "unsupported_auth_operation", 404);
  }
  const originError = validateMutationOrigin(request);
  if (originError) return authGuard(originError, "origin_not_allowed");
  const limited = await apiRateLimit(request, `auth-proxy-${endpoint}`, endpoint === "token" ? 20 : 60, 600_000, { critical: request.method !== "GET" });
  if (limited) {
    const code = limited.status === 429 ? "over_request_rate_limit" : "service_unavailable";
    reportAuthFailure(endpoint, limited.status, code, "rate_limit");
    return authGuard(limited, code);
  }
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!base || !key || process.env.NEXT_PUBLIC_SUPABASE_OFFLINE === "true") {
    reportAuthFailure(endpoint, 503, "service_unavailable", "configuration");
    return authError("Giriş servisine şu anda ulaşılamıyor.", "service_unavailable", 503);
  }
  const target = new URL(`/auth/v1/${endpoint}`, base);
  const incoming = new URL(request.url);
  for (const name of ["grant_type", "redirect_to", "scope"]) {
    const value = incoming.searchParams.get(name);
    if (value) target.searchParams.set(name, value);
  }
  let body: string | undefined;
  if (request.method !== "GET" && !(endpoint === "logout" && !request.body)) {
    const parsed = await readBoundedJson(request, 16_384);
    if (!parsed.ok) return authGuard(parsed.response, "invalid_auth_request");
    body = JSON.stringify(parsed.value);
  }
  const authorization = request.headers.get("authorization");
  if (authorization && (authorization.length > 8192 || !/^Bearer [A-Za-z0-9._~-]+$/.test(authorization))) {
    return authError("Geçersiz oturum.", "bad_jwt", 401);
  }
  const apiVersion = request.headers.get(apiVersionHeader);
  if (apiVersion && !validApiVersion(apiVersion)) return authError("Geçersiz kimlik API sürümü.", "invalid_auth_request", 422);
  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers: { apikey: key, "Content-Type": "application/json", ...(authorization ? { Authorization: authorization } : {}), ...(apiVersion ? { [apiVersionHeader]: apiVersion } : {}) },
      body, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(12_000),
    });
    const payload = upstream.status === 204 ? null : await upstream.text();
    const upstreamVersion = upstream.headers.get(apiVersionHeader);
    if (!upstream.ok) {
      let code = "unknown";
      try {
        const data = JSON.parse(payload ?? "{}");
        const candidate = data?.error_code ?? data?.code;
        if (typeof candidate === "string" && /^[a-z_]{1,80}$/.test(candidate)) code = candidate;
      } catch { /* Do not log provider text, even for non-JSON errors. */ }
      reportAuthFailure(endpoint, upstream.status, code, "upstream");
    }
    return new NextResponse(payload, { status: upstream.status, headers: {
      "Content-Type": "application/json", "Cache-Control": "private, no-store",
      ...(upstream.headers.get("retry-after") ? { "Retry-After": upstream.headers.get("retry-after")! } : {}),
      ...(upstreamVersion && validApiVersion(upstreamVersion) ? { [apiVersionHeader]: upstreamVersion } : {}),
    } });
  } catch {
    reportAuthFailure(endpoint, 503, "service_unavailable", "connection");
    return authError("Bağlantı kurulamadı. Lütfen yeniden dene.", "service_unavailable", 503);
  }
}

export { handle as GET, handle as POST, handle as PUT };
