"use client";

import Link from "next/link";
import { Bell, CalendarDays, ChevronDown, MapPin, Menu, Search, UserRound, X } from "lucide-react";
import { useEffect, useState } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { ButtonLink } from "@/components/ui/button";
import { getSessionSummary, type SessionSummary } from "@/lib/session-summary-client";

export function SiteHeader({ search = false }: { search?: boolean }) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [session, setSession] = useState<SessionSummary | null>(null);

  useEffect(() => {
    if (!search) return;
    const query = new URLSearchParams(window.location.search).get("q") ?? "";
    queueMicrotask(() => setSearchQuery(query));
  }, [search]);

  useEffect(() => {
    let active = true;
    void getSessionSummary().then((value) => { if (active) setSession(value); });
    return () => { active = false; };
  }, []);

  const sessionReady = session !== null;
  const authenticated = Boolean(session?.authenticated);
  const unreadCount = session?.unreadCount ?? 0;
  const businessHref = session?.hasBusiness ? "/business/dashboard" : session?.isAdmin ? "/admin" : authenticated ? "/business/onboarding" : "/business";
  const businessLabel = session?.hasBusiness ? "İşletmem" : session?.isAdmin ? "Admin Paneli" : "İşletme Ol";
  const businessLinkReady = sessionReady;

  return (
    <header className="sticky top-0 z-50 border-b border-[#ECECF1] bg-white/95 backdrop-blur-xl">
      <div className="container-shell flex h-[72px] items-center gap-6">
        <BrandLogo />
        {search && (
          <form action="/kesfet" role="search" className="hidden h-11 min-w-0 flex-1 items-center gap-2 rounded-xl border border-[#E8E8EE] bg-[#FAFAFC] pl-3 text-sm text-[#73737D] transition focus-within:border-[#BDB0F5] focus-within:bg-white focus-within:ring-4 focus-within:ring-[#6C4BF4]/10 md:flex lg:max-w-[520px]">
            <Search className="h-4 w-4 shrink-0 text-[#6C4BF4]" />
            <input type="search" name="q" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} aria-label="Hizmet veya işletme ara" placeholder="Hizmet veya işletme ara..." className="min-w-0 flex-1 bg-transparent text-sm text-[#27272A] outline-none placeholder:text-[#8B8B95] [&::-webkit-search-cancel-button]:cursor-pointer" />
            <span className="ml-auto flex items-center gap-1 border-l border-[#E4E4EA] pl-3 text-xs text-[#3F3F46]"><MapPin className="h-3.5 w-3.5 text-[#6C4BF4]" /> {session?.city ?? "Konum seç"} <ChevronDown className="h-3 w-3" /></span>
            <button type="submit" aria-label="Aramayı başlat" className="grid h-full w-10 shrink-0 place-items-center rounded-r-xl bg-[#6C4BF4] text-white transition hover:bg-[#5635E6]"><Search className="h-4 w-4" /></button>
          </form>
        )}
        <nav className="ml-auto hidden items-center gap-7 text-sm font-medium md:flex">
          <Link href="/kesfet" className="hover:text-[#6C4BF4]">Keşfet</Link>
          <Link href="/#categories" className="hover:text-[#6C4BF4]">Kategoriler</Link>
          {businessLinkReady ? <Link href={businessHref} className="hover:text-[#6C4BF4]">{businessLabel}</Link> : <span className="h-4 w-20 animate-pulse rounded bg-[#F1F1F5]" aria-label="İşletme hesabı kontrol ediliyor" />}
          <Link href="/appointments" className="flex items-center gap-1.5 hover:text-[#6C4BF4]"><CalendarDays className="h-4 w-4" /> Randevularım</Link>
          <Link href="/notifications" aria-label={unreadCount ? `${unreadCount} okunmamış bildirim` : "Bildirimler"} className="relative"><Bell className="h-5 w-5" />{unreadCount > 0 && <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-[#EF4444] ring-2 ring-white" />}</Link>
          {sessionReady && authenticated ? (
            <Link href="/profile" className="flex h-10 items-center gap-2 rounded-xl border border-[#E4E4EA] bg-white px-3 transition hover:border-[#C9BEFA] hover:bg-[#FAF8FF]" aria-label="Profilim">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-[#EEE9FF] text-[#6C4BF4]"><UserRound className="h-4 w-4" /></span>
              <span className="max-w-32 truncate text-sm font-semibold">{session.displayName ?? "Profilim"}</span>
              <ChevronDown className="h-3.5 w-3.5 text-[#8A8A94]" />
            </Link>
          ) : sessionReady ? (
            <>
              <ButtonLink href="/auth/login" variant="ghost" className="h-10">Giriş Yap</ButtonLink>
              <ButtonLink href="/auth/login?mode=signup" className="h-10">Ücretsiz Kayıt Ol</ButtonLink>
            </>
          ) : (
            <span className="h-10 w-40 animate-pulse rounded-xl bg-[#F1F1F5]" aria-label="Oturum kontrol ediliyor" />
          )}
        </nav>
        <button className="ml-auto grid h-10 w-10 place-items-center rounded-xl border border-[#E8E8EE] md:hidden" onClick={() => setOpen((value) => !value)} aria-label="Menü">
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>
      {open && (
        <nav className="container-shell grid gap-1 border-t border-[#ECECF1] py-3 text-sm font-medium md:hidden">
          <Link href="/kesfet" className="rounded-xl px-3 py-3">Keşfet</Link>
          {businessLinkReady && <Link href={businessHref} className="rounded-xl px-3 py-3">{businessLabel}</Link>}
          <Link href="/appointments" className="rounded-xl px-3 py-3">Randevularım</Link>
          {sessionReady && authenticated ? (
            <>
              <Link href="/notifications" className="rounded-xl px-3 py-3">Bildirimler</Link>
              <Link href="/profile" className="flex items-center justify-center gap-2 rounded-xl bg-[#6C4BF4] px-3 py-3 text-center text-white"><UserRound className="h-4 w-4" /> {session.displayName ?? "Profilim"}</Link>
            </>
          ) : sessionReady ? (
            <Link href="/auth/login" className="rounded-xl bg-[#6C4BF4] px-3 py-3 text-center text-white">Giriş Yap</Link>
          ) : null}
        </nav>
      )}
    </header>
  );
}
