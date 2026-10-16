"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Business } from "@/lib/types";
type Page = { businesses: Business[]; total: number; hasMore: boolean };
export function useMarketplaceDirectory(query: string, initial: Business[] = []) {
  const [result, setResult] = useState<Page & { query: string; failed: boolean }>({ query: "", businesses: initial.slice(0, 12), total: 0, hasMore: false, failed: false });
  const [busy, setBusy] = useState(false);
  const version = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const invalidateRequest = useCallback(() => { version.current++; controller.current?.abort(); }, []);
  const load = useCallback(async (offset = 0) => {
    const current = ++version.current;
    controller.current?.abort();
    const request = new AbortController(); controller.current = request;
    setBusy(true);
    try {
      const response = await fetch(`/api/businesses?limit=12&offset=${offset}&${query}`, { signal: request.signal });
      if (!response.ok) throw new Error("Search unavailable");
      const page = await response.json() as Page;
      if (current !== version.current) return;
      setResult((previous) => ({ ...page, query, failed: false, businesses: offset && previous.query === query ? [...previous.businesses, ...page.businesses.filter((business) => !previous.businesses.some((old) => old.id === business.id))] : page.businesses }));
    } catch { if (current === version.current && !request.signal.aborted) setResult({ query, businesses: [], total: 0, hasMore: false, failed: true }); }
    finally { if (current === version.current) setBusy(false); }
  }, [query]);
  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 300);
    return () => { window.clearTimeout(timer); invalidateRequest(); };
  }, [load, invalidateRequest]);
  const current = result.query === query;
  return { businesses: current ? result.businesses : [], total: current ? result.total : 0, hasMore: current && result.hasMore, loading: busy || !current, error: current && result.failed, retry: () => load(), loadMore: () => load(result.businesses.length) };
}
