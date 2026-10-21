import { NextResponse } from "next/server";
import { processCommunicationJobs } from "@/lib/communication-worker";
import { emitEvent } from "@/lib/observability";

export const runtime = "nodejs";

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  return Boolean(
    secret && request.headers.get("authorization") === `Bearer ${secret}`,
  );
}

export async function POST(request: Request) {
  if (!authorized(request))
    return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  try {
    const result = await processCommunicationJobs(25);
    await emitEvent("info", {
      event: "communication_batch_completed",
      ...result,
    });
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    await emitEvent("error", { event: "communication_batch_failed", error });
    return NextResponse.json(
      { error: "İletişim kuyruğu işlenemedi." },
      { status: 503 },
    );
  }
}

export async function GET(request: Request) {
  return POST(request);
}
