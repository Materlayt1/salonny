"use client";
import { useSyncExternalStore } from "react";
import { getNotificationSummarySnapshot, getServerNotificationSummarySnapshot, subscribeNotificationSummary } from "@/lib/notification-summary-store";

export function useNotificationSummary() {
  return useSyncExternalStore(subscribeNotificationSummary, getNotificationSummarySnapshot, getServerNotificationSummarySnapshot);
}
