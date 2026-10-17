import { validBrowseSelection, type BrowseSelection } from "@salonny/contracts/browse-area";
const key = "salonny.browse-area.v1";
let selection: BrowseSelection = "auto";
let initialized = false;
const listeners = new Set<() => void>();
function publish(value: BrowseSelection) { selection = value; listeners.forEach((notify) => notify()); }
export const browseAreaStore = {
  getSnapshot: () => selection,
  getServerSnapshot: () => "auto",
  subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  initialize: () => {
    if (initialized || typeof window === "undefined") return;
    initialized = true;
    try { publish(validBrowseSelection(window.localStorage.getItem(key))); } catch { /* Session-only when storage is unavailable. */ }
  },
  select: (value: BrowseSelection) => {
    initialized = true;
    const safe = validBrowseSelection(value);
    publish(safe);
    try { window.localStorage.setItem(key, safe); } catch { /* Do not block discovery. */ }
  },
};
