import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { getBusiness, listBusinesses, listCategories, type BusinessQuery } from "@/lib/api";
import { useBrowseArea } from "@/providers/browse-area-provider";
import { businessInArea, type BrowseArea } from "@salonny/contracts/browse-area";

function withArea(query: BusinessQuery, area: BrowseArea) {
  const scoped = { ...query, ...area, city: area.city };
  if (area.lat === undefined) { delete scoped.lat; delete scoped.lng; }
  if (scoped.sort === "nearest" && area.lat === undefined) scoped.sort = "recommended";
  return scoped;
}

const pageSize = 12;

function useDebounced(value: string | undefined) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), 300);
    return () => clearTimeout(timer);
  }, [value]);
  return settled;
}

export function useBusinessRail(
  key: string,
  query: Omit<BusinessQuery, "limit">,
  limit = 10,
  enabled = true,
) {
  const browse = useBrowseArea();
  const scoped = withArea(query, browse.area);
  return useQuery({
    queryKey: ["business-rail", key, scoped, limit],
    queryFn: async () => { const result = await listBusinesses({ ...scoped, limit }); return { ...result, businesses: result.businesses.filter((business) => businessInArea(business, browse.area)) }; },
    enabled: enabled && browse.ready,
  });
}

export function useBusinessDirectory(query: Omit<BusinessQuery, "offset" | "limit">) {
  const browse = useBrowseArea();
  // Typed search is debounced; sheet filters apply together, without an old-city request.
  const settled = withArea({ ...query, q: useDebounced(query.q) }, browse.area);
  return useInfiniteQuery({
    queryKey: ["business-directory", settled],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => { const result = await listBusinesses({
      ...settled,
      offset: pageParam,
      limit: pageSize,
    }); return { ...result, businesses: result.businesses.filter((business) => businessInArea(business, browse.area)) }; },
    enabled: browse.ready,
    getNextPageParam: (lastPage, pages) =>
      lastPage.hasMore ? pages.length * pageSize : undefined,
  });
}

export function useCategories() {
  return useQuery({ queryKey: ["categories"], queryFn: listCategories, staleTime: 5 * 60_000 });
}

export function useBusiness(slug: string) {
  return useQuery({
    queryKey: ["business", slug],
    queryFn: () => getBusiness(slug),
    enabled: Boolean(slug),
  });
}
