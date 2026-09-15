import type { Instrumentation } from "next";
import { emitEvent } from "@/lib/observability";

export const onRequestError: Instrumentation.onRequestError = (error, request, context) => {
  const digest = typeof error === "object" && error !== null && "digest" in error ? String(error.digest) : undefined;
  const message = error instanceof Error ? error.message : String(error);
  const path = request.path.split("?", 1)[0];
  void emitEvent("error", {
    event: "request_error",
    message,
    digest,
    method: request.method,
    path,
    routePath: context.routePath,
    routeType: context.routeType,
    routerKind: context.routerKind,
    renderSource: context.renderSource,
    revalidateReason: context.revalidateReason,
  });
};
