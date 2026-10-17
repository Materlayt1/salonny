"use client";
import { useEffect, useState } from "react";
import { businessInArea } from "@salonny/contracts/browse-area";
import { useBrowseArea } from "@/components/use-browse-area";
import type { Business } from "@/lib/types";
export function useAreaBusinesses(initial: Business[]) {
  const browse = useBrowseArea();
  const [result, setResult] = useState<{ key: string; items: Business[]; error: boolean }>({ key: "", items: initial, error: false });
  useEffect(() => {
    if (!browse.key) return;
    const controller = new AbortController();
    void fetch(`/api/businesses?limit=50&${browse.key}`, { signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error("Area unavailable");
      const payload = await response.json() as { businesses: Business[] };
      if (!controller.signal.aborted) setResult({ key: browse.key, items: payload.businesses, error: false });
    }).catch(() => { if (!controller.signal.aborted) setResult({ key: browse.key, items: [], error: true }); });
    return () => controller.abort();
  }, [browse.key]);
  const matching = browse.key === result.key;
  const businesses = (browse.key ? matching ? result.items : [] : initial).filter((business) => businessInArea(business, browse.area));
  return { ...browse, businesses, loading: Boolean(browse.key && !matching), error: matching && result.error };
}
