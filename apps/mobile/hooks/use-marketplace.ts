import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { getBusiness, listBusinesses, listCategories, type BusinessQuery } from "@/lib/api";

const pageSize = 12;

export function useBusinessRail(
  key: string,
  query: Omit<BusinessQuery, "limit">,
  limit = 10,
) {
  return useQuery({
    queryKey: ["business-rail", key, query, limit],
    queryFn: () => listBusinesses({ ...query, limit }),
  });
}

export function useBusinessDirectory(query: Omit<BusinessQuery, "offset" | "limit">) {
  return useInfiniteQuery({
    queryKey: ["business-directory", query],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => listBusinesses({
      ...query,
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
