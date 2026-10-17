import { createContext, useCallback, useContext, useEffect, useRef, useState, type PropsWithChildren } from "react";
import { areaQuery, browseAreaLabel, resolveBrowseArea, validBrowseSelection, type BrowseSelection } from "@salonny/contracts/browse-area";
import { authStorage as preferenceStorage } from "@/lib/secure-storage";
import { useLocation } from "@/providers/location-provider";
const storageKey = "salonny.browse-area.v1";
type State = { selection: BrowseSelection; select: (value: string) => void; ready: boolean };
const Context = createContext<State | null>(null);
export function BrowseAreaProvider({ children }: PropsWithChildren) {
  const [selection, setSelection] = useState<BrowseSelection>("auto");
  const [ready, setReady] = useState(false);
  const revision = useRef(0);
  useEffect(() => { let active = true; const start = revision.current; void Promise.resolve().then(() => preferenceStorage.getItem(storageKey)).then((value) => { if (active && revision.current === start) setSelection(validBrowseSelection(value)); }).catch(() => {}).finally(() => { if (active) setReady(true); }); return () => { active = false; }; }, []);
  const select = useCallback((value: string) => { revision.current++; const safe = validBrowseSelection(value); setSelection(safe); setReady(true); void Promise.resolve(preferenceStorage.setItem(storageKey, safe)).catch(() => {}); }, []);
  return <Context.Provider value={{ selection, select, ready }}>{children}</Context.Provider>;
}
export function useBrowseArea() {
  const state = useContext(Context);
  if (!state) throw new Error("BrowseAreaProvider gerekli");
  const location = useLocation();
  const area = resolveBrowseArea(state.selection, location.position ? { lat: location.position.latitude, lng: location.position.longitude } : null);
  return { ...state, area, key: areaQuery(area), label: browseAreaLabel(area), location };
}
