"use client";

import { useEffect, useSyncExternalStore } from "react";
import { browserLocation } from "@/lib/browser-location";

export function useBrowserLocation() {
  const state = useSyncExternalStore(browserLocation.subscribe, browserLocation.getSnapshot, browserLocation.getServerSnapshot);
  useEffect(() => browserLocation.observePermission(), []);
  return { ...state, requestPosition: browserLocation.requestPosition };
}
