import { NextResponse } from "next/server";
import { apiRateLimit, readBoundedJson, validateMutationOrigin } from "@/lib/api-security";

const routes: Record<string, string[]> = {
  token: ["POST"], signup: ["POST"], logout: ["POST"],
  user: ["GET", "PUT"], recover: ["POST"], resend: ["POST"],
  verify: ["POST"], settings: ["GET"], health: ["GET"],
};

async function handle(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const endpoint = path.join("/");
  if (path.length !== 1 || !routes[endpoint]?.includes(request.method)) {
    return NextResponse.json({ error: "Desteklenmeyen kimlik işlemi." }, { status: 404 });
  }
  const originError = validateMutationOrigin(request);
  if (originError) return originError;
  const limited = await apiRateLimit(request, `auth-proxy-${endpoint}`, endpoint === "token" ? 20 : 60, 600_000, { critical: request.method !== "GET" });
  if (limited) return limited;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!base || !key || process.env.NEXT_PUBLIC_SUPABASE_OFFLINE === "true") {
    return NextResponse.json({ code: "service_unavailable", error: "Giriş servisine şu anda ulaşılamıyor." }, { status: 503 });
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
    if (!parsed.ok) return parsed.response;
    body = JSON.stringify(parsed.value);
  }
  const authorization = request.headers.get("authorization");
  if (authorization && (authorization.length > 8192 || !/^Bearer [A-Za-z0-9._~-]+$/.test(authorization))) {
    return NextResponse.json({ error: "Geçersiz oturum." }, { status: 401 });
  }
  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers: { apikey: key, "Content-Type": "application/json", ...(authorization ? { Authorization: authorization } : {}) },
      body, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(12_000),
    });
    const payload = upstream.status === 204 ? null : await upstream.text();
    return new NextResponse(payload, { status: upstream.status, headers: {
      "Content-Type": "application/json", "Cache-Control": "private, no-store",
      ...(upstream.headers.get("retry-after") ? { "Retry-After": upstream.headers.get("retry-after")! } : {}),
    } });
  } catch {
    return NextResponse.json({ code: "service_unavailable", error: "Bağlantı kurulamadı. Lütfen yeniden dene." }, { status: 503 });
  }
}

export { handle as GET, handle as POST, handle as PUT };
