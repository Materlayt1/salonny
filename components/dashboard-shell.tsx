"use client";

import Link from "next/link";
import { BarChart3, Bell, CalendarDays, ChevronDown, ClipboardList, LayoutDashboard, Megaphone, Menu, Package, Scissors, Settings, Store, UserRound, UsersRound, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/business/dashboard", label: "Özet", icon: LayoutDashboard },
  { href: "/business/calendar", label: "Takvim", icon: CalendarDays },
  { href: "/business/appointments", label: "Randevular", icon: ClipboardList },
  { href: "/business/customers", label: "Müşteriler", icon: UsersRound },
  { href: "/business/services", label: "Hizmetler", icon: Scissors },
  { href: "/business/employees", label: "Çalışanlar", icon: UserRound },
  { href: "/business/reports", label: "Raporlar", icon: BarChart3 },
  { href: "/business/inventory", label: "Stok", icon: Package },
  { href: "/business/campaigns", label: "Pazarlama", icon: Megaphone },
  { href: "/business/settings", label: "Ayarlar", icon: Settings },
];

type DashboardBusiness = { name: string; slug: string; branch: string; role: "OWNER" | "MANAGER" | "EMPLOYEE"; person: string };

export function DashboardShell({ children, business }: { children: React.ReactNode; business: DashboardBusiness }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const initials = business.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toLocaleUpperCase("tr-TR");
  const personInitials = business.person.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toLocaleUpperCase("tr-TR");
  const roleLabel = business.role === "OWNER" ? "İşletme Sahibi" : business.role === "MANAGER" ? "İşletme Yöneticisi" : "Çalışan";
  const sidebar = <><div className="flex h-[72px] items-center border-b border-[#ECECF1] px-5"><BrandLogo /><button onClick={() => setOpen(false)} className="ml-auto md:hidden"><X className="h-5 w-5" /></button></div><div className="border-b border-[#ECECF1] p-4"><button className="flex w-full items-center gap-3 rounded-xl bg-[#F8F8FA] p-3 text-left"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#6C4BF4] text-xs font-bold text-white">{initials}</span><span className="min-w-0 flex-1"><strong className="block truncate text-xs">{business.name}</strong><span className="text-[10px] text-[#777781]">{business.branch}</span></span><ChevronDown className="h-4 w-4" /></button></div><nav className="grid gap-1 p-3">{nav.map(({ href, label, icon: Icon }) => { const active = pathname === href; return <Link key={href} href={href} onClick={() => setOpen(false)} className={cn("flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition", active ? "bg-[#F0ECFF] font-semibold text-[#5B3BE7]" : "text-[#666672] hover:bg-[#F8F8FA]")}><Icon className="h-[18px] w-[18px]" />{label}</Link>; })}</nav><div className="mt-auto border-t border-[#ECECF1] p-4">{business.slug && <Link href={`/business/${business.slug}`} className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-[#666672]"><Store className="h-4 w-4" /> Public profili gör</Link>}<div className="mt-3 flex items-center gap-3 px-3"><span className="grid h-9 w-9 place-items-center rounded-full bg-[#E8E0FF] text-xs font-semibold text-[#5B3BE7]">{personInitials}</span><div className="min-w-0 flex-1"><strong className="block truncate text-xs">{business.person}</strong><span className="text-[10px] text-[#777781]">{roleLabel}</span></div></div></div></>;
  return (
    <div className="min-h-screen bg-[#F8F8FA] md:pl-[244px]">
      <aside className="fixed inset-y-0 left-0 z-50 hidden w-[244px] flex-col border-r border-[#E8E8EE] bg-white md:flex">{sidebar}</aside>
      {open && <div className="fixed inset-0 z-[70] bg-black/35 md:hidden" onClick={() => setOpen(false)}><aside className="flex h-full w-[280px] flex-col bg-white" onClick={(e) => e.stopPropagation()}>{sidebar}</aside></div>}
      <header className="sticky top-0 z-40 flex h-[72px] items-center border-b border-[#E8E8EE] bg-white/95 px-4 backdrop-blur md:px-7"><button onClick={() => setOpen(true)} className="mr-3 grid h-10 w-10 place-items-center rounded-xl border border-[#E8E8EE] md:hidden"><Menu className="h-5 w-5" /></button><div><strong className="block text-sm">{business.name}</strong><span className="text-xs text-[#777781]">İyi çalışmalar, {business.person} 👋</span></div><div className="ml-auto flex items-center gap-3"><Link href="/notifications" aria-label="Bildirimler" className="relative grid h-10 w-10 place-items-center rounded-xl border border-[#E8E8EE]"><Bell className="h-4.5 w-4.5" /></Link><Link href="/business/onboarding?edit=1" className="hidden rounded-xl bg-[#6C4BF4] px-4 py-2.5 text-xs font-semibold text-white sm:block">Profili düzenle</Link></div></header>
      <main className="p-4 md:p-7">{children}</main>
    </div>
  );
}
