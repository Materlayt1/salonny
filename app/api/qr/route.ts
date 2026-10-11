import QRCode from "qrcode";
import { NextResponse } from "next/server";
import { apiRateLimit } from "@/lib/api-security";

const tokenPattern = /^[a-f0-9]{18}$/;

export async function GET(request: Request) {
  const limited = await apiRateLimit(request, "booking-qr", 120, 60_000);
  if (limited) return limited;
  const token = new URL(request.url).searchParams.get("token") ?? "";
  if (!tokenPattern.test(token))
    return NextResponse.json({ error: "Geçersiz bağlantı." }, { status: 422 });
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
  const bookingUrl = new URL(`/r/${token}`, appUrl).toString();
  const svg = await QRCode.toString(bookingUrl, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 2,
    color: { dark: "#17171C", light: "#FFFFFF" },
  });
  return new NextResponse(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
