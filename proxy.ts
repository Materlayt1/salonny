import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
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
    "/admin/:path*",
    "/business/onboarding/:path*",
    "/business/dashboard/:path*", "/business/calendar/:path*", "/business/appointments/:path*",
    "/business/customers/:path*", "/business/services/:path*", "/business/employees/:path*",
    "/business/reports/:path*", "/business/inventory/:path*", "/business/campaigns/:path*", "/business/settings/:path*",
    "/appointments/:path*", "/notifications/:path*", "/favorites/:path*", "/profile/:path*", "/delete-account/:path*",
  ],
};
