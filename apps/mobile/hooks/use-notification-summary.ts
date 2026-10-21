import { useCallback } from "react";
import { useFocusEffect } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { getNotificationSummary } from "@/lib/api";
import { useAuth } from "@/providers/auth-provider";

export function useNotificationSummary() {
  const { session } = useAuth();
  const query = useQuery({
    queryKey: ["notification-summary", session?.user.id, session?.access_token],
    queryFn: ({ signal }) => getNotificationSummary(session!.access_token, signal),
    enabled: Boolean(session), staleTime: 30_000, refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
  const { refetch } = query;
  useFocusEffect(useCallback(() => { if (session) void refetch(); }, [session, refetch]));
  return query;
}
