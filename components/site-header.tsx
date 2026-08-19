"use client";

import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { Bell, CalendarDays, ChevronDown, MapPin, Menu, Search, UserRound, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { ButtonLink } from "@/components/ui/button";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

function displayName(user: User) {
  const metadataName = user.user_metadata.full_name ?? user.user_metadata.name;
  if (typeof metadataName === "string" && metadataName.trim()) return metadataName.trim();
  return user.email?.split("@")[0] ?? "Profilim";
}

export function SiteHeader({ search = false }: { search?: boolean }) {
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [businessAccess, setBusinessAccess] = useState<{ userId: string; hasBusiness: boolean; isAdmin: boolean; city: string | null } | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);

  useEffect(() => {
    if (!supabase) return;

    let active = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      setUser(data.user);
      if (!data.user) setUnreadCount(0);
      setAuthReady(true);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setUser(session?.user ?? null);
      if (!session?.user) setUnreadCount(0);
      setAuthReady(true);
    });

    return () => {
      active = false;
      authListener.subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    if (!supabase || !user) return;
    let active = true;
    void Promise.all([
      supabase.from("business_members").select("business_id").eq("user_id", user.id).eq("active", true).limit(1).maybeSingle(),
      supabase.from("users").select("role,city").eq("id", user.id).maybeSingle(),
    ]).then(([membershipResult, userResult]) => {
        if (!active) return;
        setBusinessAccess({ userId: user.id, hasBusiness: Boolean(membershipResult.data?.business_id), isAdmin: userResult.data?.role === "ADMIN", city: userResult.data?.city ?? null });
      });
    return () => { active = false; };
  }, [supabase, user]);

  useEffect(() => {
    if (!supabase || !user) return;
    let active = true;
    const sync = async () => {
      const { count } = await supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).is("read_at", null);
      if (active) setUnreadCount(count ?? 0);
    };
    void sync();
    window.addEventListener("salonny:notifications", sync);
    return () => { active = false; window.removeEventListener("salonny:notifications", sync); };
  }, [supabase, user]);

  const userName = user ? displayName(user) : "";
  const sessionReady = authReady || !supabase;
  const hasBusiness = Boolean(user && businessAccess?.userId === user.id && businessAccess.hasBusiness);
  const isAdmin = Boolean(user && businessAccess?.userId === user.id && businessAccess.isAdmin);
  const businessAccessReady = !user || !supabase || businessAccess?.userId === user.id;
  const businessHref = hasBusiness ? "/business/dashboard" : isAdmin ? "/admin" : user ? "/business/onboarding" : "/business";
  const businessLabel = hasBusiness ? "İşletmem" : isAdmin ? "Admin Paneli" : "İşletme Ol";
  const businessLinkReady = sessionReady && (!user || businessAccessReady);

  return (
    <header className="sticky top-0 z-50 border-b border-[#ECECF1] bg-white/95 backdrop-blur-xl">
      <div className="container-shell flex h-[72px] items-center gap-6">
        <BrandLogo />
        {search && (
          <Link href="/kesfet" className="hidden h-11 min-w-0 flex-1 items-center gap-3 rounded-xl border border-[#E8E8EE] bg-[#FAFAFC] px-4 text-sm text-[#73737D] md:flex lg:max-w-[520px]">
            <Search className="h-4 w-4" />
            <span className="truncate">Hizmet veya işletme ara...</span>
            <span className="ml-auto flex items-center gap-1 border-l border-[#E4E4EA] pl-3 text-xs text-[#3F3F46]"><MapPin className="h-3.5 w-3.5 text-[#6C4BF4]" /> {businessAccess?.city ?? "Konum seç"} <ChevronDown className="h-3 w-3" /></span>
          </Link>
        )}
        <nav className="ml-auto hidden items-center gap-7 text-sm font-medium md:flex">
          <Link href="/kesfet" className="hover:text-[#6C4BF4]">Keşfet</Link>
          <Link href="/#categories" className="hover:text-[#6C4BF4]">Kategoriler</Link>
          {businessLinkReady ? <Link href={businessHref} className="hover:text-[#6C4BF4]">{businessLabel}</Link> : <span className="h-4 w-20 animate-pulse rounded bg-[#F1F1F5]" aria-label="İşletme hesabı kontrol ediliyor" />}
          <Link href="/appointments" className="flex items-center gap-1.5 hover:text-[#6C4BF4]"><CalendarDays className="h-4 w-4" /> Randevularım</Link>
          <Link href="/notifications" aria-label={unreadCount ? `${unreadCount} okunmamış bildirim` : "Bildirimler"} className="relative"><Bell className="h-5 w-5" />{unreadCount > 0 && <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-[#EF4444] ring-2 ring-white" />}</Link>
          {sessionReady && user ? (
            <Link href="/profile" className="flex h-10 items-center gap-2 rounded-xl border border-[#E4E4EA] bg-white px-3 transition hover:border-[#C9BEFA] hover:bg-[#FAF8FF]" aria-label="Profilim">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-[#EEE9FF] text-[#6C4BF4]"><UserRound className="h-4 w-4" /></span>
              <span className="max-w-32 truncate text-sm font-semibold">{userName}</span>
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
          {sessionReady && user ? (
            <>
              <Link href="/notifications" className="rounded-xl px-3 py-3">Bildirimler</Link>
              <Link href="/profile" className="flex items-center justify-center gap-2 rounded-xl bg-[#6C4BF4] px-3 py-3 text-center text-white"><UserRound className="h-4 w-4" /> {userName}</Link>
            </>
          ) : sessionReady ? (
            <Link href="/auth/login" className="rounded-xl bg-[#6C4BF4] px-3 py-3 text-center text-white">Giriş Yap</Link>
          ) : null}
        </nav>
      )}
    </header>
  );
}
