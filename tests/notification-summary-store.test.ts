import { afterEach, expect, it, vi } from "vitest";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.resetModules(); });
async function setup() {
  vi.useFakeTimers();
  const win = new EventTarget();
  const doc = Object.assign(new EventTarget(), { visibilityState: "visible" });
  const close = vi.fn();
  const fetcher = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ unreadCount: 3, checkedAt: "2026-10-19T10:00:00Z" }) });
  vi.stubGlobal("window", win); vi.stubGlobal("document", doc); vi.stubGlobal("fetch", fetcher);
  vi.stubGlobal("BroadcastChannel", class { onmessage = null; close = close; });
  return { win, doc, fetcher, close, ...await import("@/lib/notification-summary-store") };
}
it("shares one mount request, timer and focus/visibility burst across all badges", async () => {
  const store = await setup();
  const stops = [store.subscribeNotificationSummary(vi.fn()), store.subscribeNotificationSummary(vi.fn()), store.subscribeNotificationSummary(vi.fn())];
  await vi.advanceTimersByTimeAsync(0);
  expect(store.fetcher).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(1);
  expect(store.getNotificationSummarySnapshot()).toEqual({ data: { unreadCount: 3, checkedAt: "2026-10-19T10:00:00Z" }, error: false });
  store.win.dispatchEvent(new Event("focus")); store.win.dispatchEvent(new Event("focus")); store.doc.dispatchEvent(new Event("visibilitychange"));
  await vi.advanceTimersByTimeAsync(0); expect(store.fetcher).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(60_000); expect(store.fetcher).toHaveBeenCalledTimes(3);
  stops.forEach((stop) => stop()); expect(vi.getTimerCount()).toBe(0); expect(store.close).toHaveBeenCalledTimes(1);
  store.win.dispatchEvent(new Event("focus")); await vi.advanceTimersByTimeAsync(60_000); expect(store.fetcher).toHaveBeenCalledTimes(3);
});
it("does not poll a hidden page and refreshes once on return", async () => {
  const store = await setup(); const stop = store.subscribeNotificationSummary(vi.fn()); await vi.advanceTimersByTimeAsync(0);
  store.doc.visibilityState = "hidden"; store.doc.dispatchEvent(new Event("visibilitychange"));
  await vi.advanceTimersByTimeAsync(120_000); expect(store.fetcher).toHaveBeenCalledTimes(1);
  store.doc.visibilityState = "visible"; store.doc.dispatchEvent(new Event("visibilitychange")); store.win.dispatchEvent(new Event("focus"));
  await vi.advanceTimersByTimeAsync(0); expect(store.fetcher).toHaveBeenCalledTimes(2); stop();
});
it("clears a prior mount and ignores its late response after a new consumer mounts", async () => {
  const store = await setup();
  let resolveOld: (value: unknown) => void = () => {};
  store.fetcher.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }));
  const old = store.subscribeNotificationSummary(vi.fn()); await vi.advanceTimersByTimeAsync(0); old();
  const current = store.subscribeNotificationSummary(vi.fn());
  expect(store.getNotificationSummarySnapshot()).toEqual({ data: null, error: false });
  await vi.advanceTimersByTimeAsync(0);
  resolveOld({ ok: true, status: 200, json: async () => ({ unreadCount: 99, checkedAt: "2026-10-19T09:00:00Z" }) });
  await vi.advanceTimersByTimeAsync(0);
  expect(store.getNotificationSummarySnapshot().data?.unreadCount).toBe(3); current();
});
it("keeps errors distinct from zero unread and recovers on invalidation", async () => {
  const store = await setup(); store.fetcher.mockRejectedValueOnce(new Error("offline"));
  const stop = store.subscribeNotificationSummary(vi.fn()); await vi.advanceTimersByTimeAsync(0);
  expect(store.getNotificationSummarySnapshot()).toEqual({ data: null, error: true });
  store.win.dispatchEvent(new Event("salonny:notifications")); await vi.advanceTimersByTimeAsync(0);
  expect(store.getNotificationSummarySnapshot().data?.unreadCount).toBe(3); expect(store.getNotificationSummarySnapshot().error).toBe(false); stop();
});
