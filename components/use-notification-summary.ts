"use client";
import { useEffect, useState } from "react";
import type { NotificationSummary } from "@salonny/contracts";
import { clearNotificationSummary, notificationSummary, receiveNotificationChange } from "@/lib/notification-client";

export function useNotificationSummary() {
  const [state, setState] = useState<{ data: NotificationSummary | null; error: boolean }>({ data: null, error: false });
  useEffect(() => {
    let active = true, generation = 0;
    const refresh = () => {
      if (document.visibilityState === "hidden") return;
      const ticket = ++generation;
      void notificationSummary().then((data) => { if (active && ticket === generation) setState({ data, error: false }); }).catch(() => { if (active && ticket === generation) setState({ data: null, error: true }); });
    };
    const invalidate = () => { clearNotificationSummary(); refresh(); };
    clearNotificationSummary(); refresh(); // Never reuse a previous account's mount cache.
    const interval = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", invalidate);
    window.addEventListener("salonny:notifications", refresh);
    document.addEventListener("visibilitychange", invalidate);
    const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("salonny-notifications");
    if (channel) channel.onmessage = (event) => receiveNotificationChange(event.data);
    return () => { active = false; clearInterval(interval); window.removeEventListener("focus", invalidate); window.removeEventListener("salonny:notifications", refresh); document.removeEventListener("visibilitychange", invalidate); channel?.close(); };
  }, []);
  return state;
}
