import type { NotificationSummary } from "@salonny/contracts";
import { clearNotificationSummary, notificationSummary, receiveNotificationChange } from "@/lib/notification-client";

type SummaryState = { data: NotificationSummary | null; error: boolean };
const empty: SummaryState = { data: null, error: false };
let state = empty;
let generation = 0;
let queued = false;
let cleanup: (() => void) | undefined;
const listeners = new Set<() => void>();
function publish(next: SummaryState) { state = next; listeners.forEach((listener) => listener()); }

function scheduleRefresh() {
  // One event can reach several badges, or focus and visibility can fire together.
  generation++;
  if (queued) return;
  queued = true;
  queueMicrotask(() => {
    queued = false;
    if (!listeners.size || document.visibilityState === "hidden") return;
    const ticket = generation;
    clearNotificationSummary();
    void notificationSummary().then((data) => {
      if (listeners.size && ticket === generation) publish({ data, error: false });
    }).catch(() => {
      if (listeners.size && ticket === generation) publish({ data: null, error: true });
    });
  });
}

export function subscribeNotificationSummary(listener: () => void) {
  listeners.add(listener);
  // A newly mounted account/route must never inherit the previous mount's count.
  publish(empty);
  scheduleRefresh();
  if (!cleanup) {
    const interval = setInterval(scheduleRefresh, 60_000);
    window.addEventListener("focus", scheduleRefresh);
    window.addEventListener("salonny:notifications", scheduleRefresh);
    document.addEventListener("visibilitychange", scheduleRefresh);
    const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("salonny-notifications");
    if (channel) channel.onmessage = (event) => receiveNotificationChange(event.data);
    cleanup = () => {
      clearInterval(interval);
      window.removeEventListener("focus", scheduleRefresh);
      window.removeEventListener("salonny:notifications", scheduleRefresh);
      document.removeEventListener("visibilitychange", scheduleRefresh);
      channel?.close();
    };
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      generation++;
      cleanup?.(); cleanup = undefined;
      clearNotificationSummary(); state = empty;
    }
  };
}

export const getNotificationSummarySnapshot = () => state;
export const getServerNotificationSummarySnapshot = () => empty;
