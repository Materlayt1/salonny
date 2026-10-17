import { parseNotificationSummary, type NotificationSummary } from "@salonny/contracts";

let cached: { request: Promise<NotificationSummary | null>; until: number } | undefined;
const source = Math.random().toString(36).slice(2); // Ephemeral tab ID, not a credential.
let lastRemoteSignal: string | undefined;
export function notificationSummary() {
  if (cached && cached.until > Date.now()) return cached.request;
  const request = fetch("/api/notifications?summary=1", { cache: "no-store", credentials: "same-origin" }).then(async (response) => {
    if (response.status === 401) return null;
    if (!response.ok) throw new Error("Bildirim özeti alınamadı.");
    return parseNotificationSummary(await response.json());
  });
  cached = { request, until: Date.now() + 5_000 };
  return request;
}
export function clearNotificationSummary() { cached = undefined; }
export function announceNotificationChange() {
  clearNotificationSummary();
  window.dispatchEvent(new Event("salonny:notifications"));
  // Only an invalidation signal crosses tabs, never notices or credentials.
  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel("salonny-notifications");
    channel.postMessage({ source, id: `${Date.now()}-${Math.random()}` }); channel.close();
  }
}
export function receiveNotificationChange(value: unknown) {
  const signal = value as { source?: unknown; id?: unknown } | null;
  if (!signal || typeof signal.source !== "string" || signal.source === source || typeof signal.id !== "string" || signal.id.length > 100 || signal.id === lastRemoteSignal) return;
  lastRemoteSignal = signal.id;
  clearNotificationSummary();
  window.dispatchEvent(new Event("salonny:notifications"));
}
