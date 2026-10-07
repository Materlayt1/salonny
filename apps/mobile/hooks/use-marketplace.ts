import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { getBusiness, listBusinesses, listCategories, type BusinessQuery } from "@/lib/api";

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
  return useQuery({
    queryKey: ["business-rail", key, query, limit],
    queryFn: () => listBusinesses({ ...query, limit }),
    enabled,
  });
}

export function useBusinessDirectory(query: Omit<BusinessQuery, "offset" | "limit">) {
  // Typed search is debounced; sheet filters apply together, without an old-city request.
  const settled = { ...query, q: useDebounced(query.q) };
  return useInfiniteQuery({
    queryKey: ["business-directory", settled],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => listBusinesses({
      ...settled,
      offset: pageParam,
      limit: pageSize,
    }),
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
