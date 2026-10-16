"use client";
import { useEffect, useSyncExternalStore } from "react";
import { areaQuery, browseAreaLabel, resolveBrowseArea } from "@salonny/contracts/browse-area";
import { browseAreaStore } from "@/lib/browse-area-store";
import { useBrowserLocation } from "@/components/use-browser-location";
export function useBrowseArea() {
  const selection = useSyncExternalStore(browseAreaStore.subscribe, browseAreaStore.getSnapshot, browseAreaStore.getServerSnapshot);
  const location = useBrowserLocation();
  useEffect(() => browseAreaStore.initialize(), []);
  const area = resolveBrowseArea(selection, location.position);
  return { selection, select: browseAreaStore.select, area, key: areaQuery(area), label: browseAreaLabel(area), location };
}
