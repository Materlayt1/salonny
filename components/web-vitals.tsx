"use client";

import { useReportWebVitals } from "next/web-vitals";

const configuredRate = Number(process.env.NEXT_PUBLIC_WEB_VITALS_SAMPLE_RATE ?? (process.env.NODE_ENV === "production" ? "0.05" : "0"));
const sampleRate = Number.isFinite(configuredRate) ? Math.min(1, Math.max(0, configuredRate)) : 0.05;
const sampled = Math.random() < sampleRate;

export function WebVitals() {
  useReportWebVitals((metric) => {
    if (!sampled) return;
    const body = JSON.stringify({
      id: metric.id,
      name: metric.name,
      value: metric.value,
      delta: metric.delta,
      rating: metric.rating,
      navigationType: metric.navigationType,
      path: window.location.pathname,
    });
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/telemetry/vitals", new Blob([body], { type: "application/json" }));
      return;
    }
    void fetch("/api/telemetry/vitals", { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true });
  });
  return null;
}
