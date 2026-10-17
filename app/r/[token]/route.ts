import { NextResponse } from "next/server";
import { createPublicSupabaseClientOptional } from "@/lib/supabase/public";

type LinkResult = { business_slug: string; service_id: string | null; source: string; campaign: string | null };
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params; if (!/^[a-f0-9]{18}$/i.test(token)) return NextResponse.redirect(new URL("/kesfet", request.url));
  const supabase = createPublicSupabaseClientOptional(); if (!supabase) return NextResponse.redirect(new URL("/kesfet", request.url));
  const { data, error } = await supabase.rpc("resolve_booking_link", { p_token: token }); const result = (Array.isArray(data) ? data[0] : data) as LinkResult | null;
  if (error || !result) return NextResponse.redirect(new URL("/kesfet", request.url));
  const target = new URL(`/booking/${result.business_slug}`, request.url); if (result.service_id) target.searchParams.set("service", result.service_id); target.searchParams.set("bookingToken", token); target.searchParams.set("source", result.source); if (result.campaign) target.searchParams.set("campaign", result.campaign);
  return NextResponse.redirect(target);
}

