import "server-only";

type LogLevel = "info" | "warn" | "error";

export type StructuredEvent = {
  event: string;
  [key: string]: unknown;
};

function sanitize(value: unknown): unknown {
  if (value instanceof Error)
    return { name: value.name, message: value.message };
  return value;
}

export async function emitEvent(level: LogLevel, event: StructuredEvent) {
  const payload = {
    ...Object.fromEntries(
      Object.entries(event).map(([key, value]) => [key, sanitize(value)]),
    ),
    level,
    service: "salonny-web",
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
    timestamp: new Date().toISOString(),
  };
  const serialized = JSON.stringify(payload);
  const sink =
    level === "error"
      ? console.error
      : level === "warn"
        ? console.warn
        : console.info;
  sink(serialized);

  const drainUrl = process.env.LOG_DRAIN_URL;
  if (!drainUrl) return;
  try {
    await fetch(drainUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.LOG_DRAIN_TOKEN
          ? { Authorization: `Bearer ${process.env.LOG_DRAIN_TOKEN}` }
          : {}),
      },
      body: serialized,
      signal: AbortSignal.timeout(3_000),
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "log_drain_failed",
        message: error instanceof Error ? error.message : String(error),
      }),
    );
  }
}
