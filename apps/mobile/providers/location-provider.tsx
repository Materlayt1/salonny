import { createContext, useCallback, useContext, useEffect, useRef, useState, type PropsWithChildren } from "react";
import * as Location from "expo-location";
import { authStorage as preferenceStorage } from "@/lib/secure-storage";
const consentKey = "salonny.location.opt-in.v1";
type Position = { latitude: number; longitude: number };
type State = { position: Position | null; busy: boolean; error: string; requestPosition: () => Promise<boolean>; clearPosition: () => void };
const Context = createContext<State | null>(null);
export function LocationProvider({ children }: PropsWithChildren) {
  const [position, setPosition] = useState<Position | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef<Promise<boolean> | null>(null);
  const generation = useRef(0);
  const invalidatePosition = useCallback(() => { generation.current++; }, []);
  const acquirePosition = useCallback((askPermission: boolean): Promise<boolean> => {
    if (inFlight.current) return inFlight.current;
    const version = generation.current;
    const request = (async () => {
    setBusy(true); setError(""); let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const current = await Location.getForegroundPermissionsAsync();
      const permission = current.granted || !askPermission ? current : await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        if (askPermission) throw new Error("Konum izni verilmedi. Şehir filtresiyle keşfetmeye devam edebilirsin.");
        return false;
      }
      const value = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Konum alınamadı. Yeniden dene veya şehir seç.")), 15_000); }),
      ]);
      // Approximate 1 km precision; never store location on disk or track in background.
      if (version !== generation.current) return false;
      setPosition({ latitude: Math.round(value.coords.latitude * 100) / 100, longitude: Math.round(value.coords.longitude * 100) / 100 });
      // Remember only the user's explicit in-app opt-in, never the coordinates.
      if (askPermission) { try { await preferenceStorage.setItem(consentKey, "1"); if (version !== generation.current) { await preferenceStorage.removeItem(consentKey); return false; } } catch { /* Location still works for this session. */ } }
      return true;
    } catch (caught) { if (version === generation.current) { setPosition(null); setError(caught instanceof Error ? caught.message : "Konum alınamadı. Şehir filtresini kullanabilirsin."); } return false; }
    finally { if (timer) clearTimeout(timer); setBusy(false); }
    })();
    inFlight.current = request;
    void request.finally(() => { if (inFlight.current === request) inFlight.current = null; });
    return request;
  }, []);
  const requestPosition = useCallback(() => acquirePosition(true), [acquirePosition]);
  useEffect(() => {
    // Restore only an already-granted permission. No first-load OS prompt,
    // persisted coordinates, continuous watcher, or background location tracking.
    let active = true;
    const version = generation.current;
    void Promise.all([preferenceStorage.getItem(consentKey), Location.getForegroundPermissionsAsync()]).then(([consent, permission]) => {
      if (active && version === generation.current && consent === "1" && permission.granted) void acquirePosition(false);
    }).catch(() => { /* The explicit action remains available on older browsers. */ });
    return () => { active = false; invalidatePosition(); };
  }, [acquirePosition, invalidatePosition]);
  return <Context.Provider value={{ position, busy, error, requestPosition, clearPosition: () => { invalidatePosition(); setPosition(null); setError(""); void Promise.resolve(preferenceStorage.removeItem(consentKey)).catch(() => {}); } }}>{children}</Context.Provider>;
}
export function useLocation() { const context = useContext(Context); if (!context) throw new Error("LocationProvider gerekli"); return context; }
