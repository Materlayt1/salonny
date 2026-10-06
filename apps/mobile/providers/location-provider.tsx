import { createContext, useCallback, useContext, useState, type PropsWithChildren } from "react";
import * as Location from "expo-location";
type Position = { latitude: number; longitude: number };
type State = { position: Position | null; busy: boolean; error: string; requestPosition: () => Promise<boolean>; clearPosition: () => void };
const Context = createContext<State | null>(null);
export function LocationProvider({ children }: PropsWithChildren) {
  const [position, setPosition] = useState<Position | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const requestPosition = useCallback(async () => {
    setBusy(true); setError(""); let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) throw new Error("Konum izni verilmedi. Şehir filtresiyle keşfetmeye devam edebilirsin.");
      const value = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Konum alınamadı. Yeniden dene veya şehir seç.")), 15_000); }),
      ]);
      // Approximate 1 km precision; never store location on disk or track in background.
      setPosition({ latitude: Math.round(value.coords.latitude * 100) / 100, longitude: Math.round(value.coords.longitude * 100) / 100 });
      return true;
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Konum alınamadı. Şehir filtresini kullanabilirsin."); return false; }
    finally { if (timer) clearTimeout(timer); setBusy(false); }
  }, []);
  return <Context.Provider value={{ position, busy, error, requestPosition, clearPosition: () => { setPosition(null); setError(""); } }}>{children}</Context.Provider>;
}
export function useLocation() { const context = useContext(Context); if (!context) throw new Error("LocationProvider gerekli"); return context; }
