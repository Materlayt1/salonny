"use client";
import Link from "next/link";
import { Bell } from "lucide-react";
import { useNotificationSummary } from "@/components/use-notification-summary";

export function NotificationBellLink() {
  const summary = useNotificationSummary();
  const count = summary.data?.unreadCount;
  return <Link href="/notifications" aria-label={summary.error ? "Bildirimler — sayı güncellenemedi" : count ? `${count} okunmamış bildirim` : "Bildirimler"} className="relative grid h-10 w-10 place-items-center rounded-xl border border-[#E8E8EE]">
    <Bell className="h-5 w-5" />{count ? <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-[#6C4BF4] px-1 text-center text-[10px] leading-5 text-white">{count > 99 ? "99+" : count}</span> : null}
  </Link>;
}
