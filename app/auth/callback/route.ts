import { NextResponse } from "next/server";
import { createServerClientOptional } from "@/lib/supabase/server";

function safeNext(value: string | null) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"));
  const supabase = await createServerClientOptional();

  if (!code || !supabase) {
    return NextResponse.redirect(new URL("/auth/login?error=callback", url.origin));
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(new URL("/auth/login?error=callback", url.origin));
  return NextResponse.redirect(new URL(next, url.origin));
}
