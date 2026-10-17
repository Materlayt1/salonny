import { afterEach, describe, expect, it, vi } from "vitest";
import { createBrowserLocationStore } from "../lib/browser-location";

function environment(state: PermissionState = "prompt") {
  const events = new EventTarget();
  const permission = Object.assign(events, { state });
  let success: PositionCallback | undefined;
  let failure: PositionErrorCallback | undefined;
  const getCurrentPosition = vi.fn((yes: PositionCallback, no: PositionErrorCallback) => { success = yes; failure = no; });
  const query = vi.fn().mockResolvedValue(permission);
  const store = createBrowserLocationStore(() => ({ geolocation: { getCurrentPosition }, permissions: { query } }) as unknown as Navigator);
  return { store, query, getCurrentPosition, permission,
    succeed: (lat = 38.42373, lng = 27.14282) => success!({ coords: { latitude: lat, longitude: lng } } as GeolocationPosition),
    fail: (code: number) => failure!({ code } as GeolocationPositionError),
  };
}
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe("shared browser location", () => {
  it("the map control shares only a valid approximate fix with the same store", () => {
    const env = environment(); expect(env.store.acceptPosition(38.42373, 27.14282)).toBe(true);
    expect(env.store.getSnapshot().position).toEqual({ lat: 38.42, lng: 27.14 });
    for (const [lat, lng] of [[0, 0], [NaN, 27], [91, 27]]) expect(env.store.acceptPosition(lat, lng)).toBe(false);
  });
  it("a late prompt-permission observation cannot cancel an explicit in-flight request", async () => {
    const env = environment(); const request = env.store.requestPosition(); const dispose = env.store.observePermission();
    await Promise.resolve(); expect(env.store.getSnapshot().status).toBe("loading");
    env.succeed(); expect(await request).toBe(true); dispose();
  });
  it("does not request first-time permission automatically", async () => {
    const env = environment(); const dispose = env.store.observePermission();
    await Promise.resolve();
    expect(env.getCurrentPosition).not.toHaveBeenCalled();
    expect(env.store.getSnapshot().status).toBe("idle"); dispose();
  });
  it("restores granted permission and exposes only approximate coordinates", async () => {
    const env = environment("granted"); const dispose = env.store.observePermission();
    await Promise.resolve(); env.succeed();
    expect(env.store.getSnapshot()).toMatchObject({ position: { lat: 38.42, lng: 27.14 }, status: "ready" });
    expect(env.store.getServerSnapshot().position).toBeNull(); dispose();
  });
  it("deduplicates concurrent consumers and reuses a fresh result", async () => {
    const env = environment(); const a = env.store.requestPosition(); const b = env.store.requestPosition();
    expect(a).toBe(b); env.succeed(); expect(await a).toBe(true);
    expect(await env.store.requestPosition()).toBe(true); expect(env.getCurrentPosition).toHaveBeenCalledTimes(1);
  });
  it("refreshes old coordinates instead of treating browser permission as a fix", async () => {
    vi.useFakeTimers(); const env = environment(); const a = env.store.requestPosition(); env.succeed(); await a;
    vi.advanceTimersByTime(300_001); const b = env.store.requestPosition(); env.fail(2);
    expect(await b).toBe(false); expect(env.store.getSnapshot()).toMatchObject({ status: "error", position: null });
  });
  it("clears an old fix when permission is revoked and ignores a late success", async () => {
    const env = environment("granted"); const dispose = env.store.observePermission(); await Promise.resolve();
    env.permission.state = "denied"; env.permission.dispatchEvent(new Event("change")); env.succeed();
    expect(env.store.getSnapshot()).toMatchObject({ status: "denied", position: null }); dispose();
  });
  it("removes permission observers on unmount", async () => {
    const env = environment("prompt"); const dispose = env.store.observePermission(); await Promise.resolve(); dispose();
    env.permission.state = "granted"; env.permission.dispatchEvent(new Event("change"));
    expect(env.getCurrentPosition).not.toHaveBeenCalled();
  });
  it("notifies all mounted consumers and supports unsubscribe", () => {
    const env = environment(); const notify = vi.fn(); const remove = env.store.subscribe(notify);
    env.store.clear(); expect(notify).toHaveBeenCalledTimes(1); remove(); env.store.clear(); expect(notify).toHaveBeenCalledTimes(1);
  });
  it.each([1, 2, 3])("shows an actionable error and no success for error %s", async (code) => {
    const env = environment(); const request = env.store.requestPosition(); env.fail(code);
    expect(await request).toBe(false); expect(env.store.getSnapshot().position).toBeNull(); expect(env.store.getSnapshot().error).toBeTruthy();
  });
  it("can recover after a failed request", async () => {
    const env = environment(); const a = env.store.requestPosition(); env.fail(3); await a;
    const b = env.store.requestPosition(); env.succeed(); expect(await b).toBe(true);
  });
  it("rejects invalid coordinates and supports browsers without geolocation", async () => {
    const env = environment(); const request = env.store.requestPosition(); env.succeed(NaN); expect(await request).toBe(false);
    const unavailable = createBrowserLocationStore(() => undefined); expect(await unavailable.requestPosition()).toBe(false);
    expect(unavailable.getSnapshot().status).toBe("unsupported");
  });
  it("keeps the explicit button working without the Permissions API", async () => {
    const env = environment(); env.query.mockRejectedValue(new TypeError("unsupported"));
    const dispose = env.store.observePermission(); await Promise.resolve(); await Promise.resolve();
    const request = env.store.requestPosition(); env.succeed(); expect(await request).toBe(true); dispose();
  });
});
