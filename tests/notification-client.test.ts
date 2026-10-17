import { afterEach, expect, it, vi } from "vitest";
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });
it("coalesces header counts and does not echo its own or duplicate remote invalidations", async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ unreadCount: 2, checkedAt: "2026-10-14T10:00:00Z" })));
  const dispatchEvent = vi.fn(); let sent: unknown;
  vi.stubGlobal("fetch", fetcher); vi.stubGlobal("window", { dispatchEvent });
  vi.stubGlobal("BroadcastChannel", class { postMessage(value: unknown) { sent = value; } close() {} });
  const { notificationSummary, announceNotificationChange, receiveNotificationChange } = await import("@/lib/notification-client");
  const first = notificationSummary(); expect(notificationSummary()).toBe(first); await first;
  expect(fetcher).toHaveBeenCalledTimes(1);
  announceNotificationChange(); expect(dispatchEvent).toHaveBeenCalledTimes(1);
  receiveNotificationChange(sent); expect(dispatchEvent).toHaveBeenCalledTimes(1);
  const other = { source: "other-tab", id: "read-receipt-1" };
  receiveNotificationChange(other); receiveNotificationChange(other); receiveNotificationChange("changed");
  expect(dispatchEvent).toHaveBeenCalledTimes(2);
});
