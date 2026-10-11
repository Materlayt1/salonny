import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    {
      status: "ok",
      service: "salonny-web",
      release: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? process.env.APP_RELEASE ?? "local",
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
