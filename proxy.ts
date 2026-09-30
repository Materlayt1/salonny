import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

const corsOptions = {
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Idempotency-Key",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

function allowedMobileOrigins() {
  const configured = process.env.MOBILE_ALLOWED_ORIGINS
    ?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean) ?? [];
  if (process.env.NODE_ENV !== "production") {
    configured.push(
      "http://localhost:8081",
      "http://localhost:8082",
      "http://localhost:19006",
    );
  }
  return new Set(configured);
}

function withCors(response: NextResponse, request: NextRequest) {
  const origin = request.headers.get("origin") ?? "";
  if (origin && allowedMobileOrigins().has(origin)) {
    response.headers.set("Access-Control-Allow-Origin", origin);
  }
  response.headers.set("Vary", "Origin");
  Object.entries(corsOptions).forEach(([key, value]) => response.headers.set(key, value));
  return response;
}

function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit) {
  const timeoutSignal = AbortSignal.timeout(2_000);
  const signal = init?.signal ? AbortSignal.any([init.signal, timeoutSignal]) : timeoutSignal;
  return fetch(input, { ...init, signal });
}

export async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    if (request.method === "OPTIONS") {
      return withCors(new NextResponse(null, { status: 204 }), request);
    }
    return withCors(NextResponse.next(), request);
  }

  if (process.env.NEXT_PUBLIC_SUPABASE_OFFLINE === "true") return NextResponse.next();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    global: { fetch: fetchWithTimeout },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookies) => {
        cookies.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = typeof claimsData?.claims?.sub === "string" ? claimsData.claims.sub : null;
  if (request.nextUrl.pathname === "/admin/login") return response;
  if (!userId) {
    const login = new URL(request.nextUrl.pathname.startsWith("/admin") ? "/admin/login" : "/auth/login", request.url);
    login.searchParams.set("next", request.nextUrl.pathname);
    if (request.nextUrl.pathname.startsWith("/business/")) login.searchParams.set("account", "business");
    return NextResponse.redirect(login);
  }

  if (request.nextUrl.pathname.startsWith("/admin")) {
    const { data } = await supabase.from("users").select("role").eq("id", userId).single();
    if (data?.role !== "ADMIN") return NextResponse.redirect(new URL("/admin/login?error=forbidden", request.url));
  }
  return response;
}

export const config = {
  matcher: [
    "/api/:path*",
    "/admin/:path*",
    "/business/onboarding/:path*",
    "/business/dashboard/:path*", "/business/calendar/:path*", "/business/appointments/:path*",
    "/business/customers/:path*", "/business/services/:path*", "/business/employees/:path*",
    "/business/reports/:path*", "/business/inventory/:path*", "/business/campaigns/:path*", "/business/settings/:path*",
    "/appointments/:path*", "/notifications/:path*", "/favorites/:path*", "/profile/:path*", "/delete-account/:path*",
  ],
};
