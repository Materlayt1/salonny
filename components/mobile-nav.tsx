"use client";

import Link from "next/link";
import { Bell, CalendarDays, Compass, Home, Plus, UserRound } from "lucide-react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const items = [
  { href: "/", label: "Ana Sayfa", icon: Home },
  { href: "/kesfet", label: "Keşfet", icon: Compass },
  { href: "/kesfet", label: "Randevu", icon: Plus, action: true },
  { href: "/appointments", label: "Randevular", icon: CalendarDays },
  { href: "/profile", label: "Profilim", icon: UserRound },
];

export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 grid h-[70px] grid-cols-5 border-t border-[#E8E8EE] bg-white px-1 pb-[env(safe-area-inset-bottom)] md:hidden">
      {items.map((item) => {
        const Icon = item.icon;
        const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
        return (
          <Link key={item.label} href={item.href} aria-label={item.label} className={cn("flex flex-col items-center justify-center gap-1 text-[10px] font-medium", active ? "text-[#6C4BF4]" : "text-[#777781]", item.action && "relative -top-3 text-[#6C4BF4]") }>
            <span className={cn("grid h-7 w-7 place-items-center rounded-full", item.action && "h-12 w-12 bg-[#6C4BF4] text-white shadow-[0_7px_18px_rgba(108,75,244,.35)]")}><Icon className={cn("h-5 w-5", item.action && "h-6 w-6")} /></span>
            <span className={cn(item.action && "sr-only")}>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function NotificationLink() {
  return <Link href="/notifications" className="relative grid h-10 w-10 place-items-center rounded-xl border border-[#E8E8EE]"><Bell className="h-5 w-5" /><span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white" /></Link>;
}
