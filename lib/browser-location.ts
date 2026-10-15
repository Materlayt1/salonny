export type BrowserPosition = { lat: number; lng: number };
export type BrowserLocationState = {
  position: BrowserPosition | null;
  status: "idle" | "loading" | "ready" | "denied" | "error" | "unsupported";
  error: string;
};
const initialState: BrowserLocationState = { position: null, status: "idle", error: "" };
const maximumAge = 5 * 60_000;

// Memory only: no coordinates in cookies, localStorage, URLs or analytics.
// Shared by the hero and discovery screen across client-side navigation.
export function createBrowserLocationStore(getNavigator = () => typeof navigator === "undefined" ? undefined : navigator) {
  let state = initialState;
  let acquiredAt = 0;
  let generation = 0;
  let pending: Promise<boolean> | null = null;
  const listeners = new Set<() => void>();
  const update = (next: BrowserLocationState) => { state = next; listeners.forEach((notify) => notify()); };
  const clear = (denied = false) => {
    generation++;
    acquiredAt = 0;
    update({ position: null, status: denied ? "denied" : "idle", error: denied ? "Konum izni kapalı. Tarayıcı ayarlarından izin verebilir veya konumsuz keşfedebilirsin." : "" });
  };
  function requestPosition(): Promise<boolean> {
    if (pending) return pending;
    if (state.position && Date.now() - acquiredAt < maximumAge) return Promise.resolve(true);
    const geo = getNavigator()?.geolocation;
    if (!geo) {
      update({ position: null, status: "unsupported", error: "Bu tarayıcıda konum kullanılamıyor. İşletmeleri konumsuz keşfedebilirsin." });
      return Promise.resolve(false);
    }
    const version = generation;
    update({ position: null, status: "loading", error: "" });
    const request = new Promise<boolean>((resolve) => {
      const failure = (error?: Pick<GeolocationPositionError, "code">) => {
        if (generation !== version) { resolve(false); return; }
        if (error?.code === 1) clear(true);
        else update({ position: null, status: "error", error: "Konumun belirlenemedi. Yeniden dene veya işletmeleri konumsuz keşfet." });
        resolve(false);
      };
      try {
        geo.getCurrentPosition((value) => {
          if (generation !== version) { resolve(false); return; }
          const { latitude, longitude } = value.coords;
          if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) { failure(); return; }
          acquiredAt = Date.now();
          update({ position: { lat: Math.round(latitude * 100) / 100, lng: Math.round(longitude * 100) / 100 }, status: "ready", error: "" });
          resolve(true);
        }, failure, { enableHighAccuracy: false, timeout: 10_000, maximumAge });
      } catch { failure(); }
    });
    pending = request;
    void request.finally(() => { if (pending === request) pending = null; });
    return request;
  }
  function observePermission() {
    let active = true;
    let permission: PermissionStatus | undefined;
    const sync = () => {
      if (!active || !permission) return;
      if (permission.state === "granted") void requestPosition();
      else clear(permission.state === "denied");
    };
    // Reading permission never prompts. Only restore a previously granted
    // location; first-time visitors opt in through the visible button.
    void getNavigator()?.permissions?.query({ name: "geolocation" }).then((result) => {
      if (!active) return;
      permission = result;
      permission.addEventListener("change", sync);
      sync();
    }).catch(() => { /* Older browsers still support the explicit button. */ });
    return () => { active = false; permission?.removeEventListener("change", sync); };
  }
  return {
    getSnapshot: () => state,
    getServerSnapshot: () => initialState,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    requestPosition, observePermission, clear,
  };
}

export const browserLocation = createBrowserLocationStore();
