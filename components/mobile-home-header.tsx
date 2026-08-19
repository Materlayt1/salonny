"use client";

import type { User } from "@supabase/supabase-js";
import { Bell } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

function firstName(user: User | null) {
  if (!user) return "";
  const name = user.user_metadata.full_name ?? user.user_metadata.name ?? user.email?.split("@")[0];
  return typeof name === "string" ? name.trim().split(/\s+/)[0] : "";
}

export function MobileHomeHeader() {
  const [user, setUser] = useState<User | null>(null);
  const [unread, setUnread] = useState(0);
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    void supabase.auth.getUser().then(async ({ data }) => {
      if (!active) return;
      setUser(data.user);
      if (!data.user) return;
      const { count } = await supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", data.user.id).is("read_at", null);
      if (active) setUnread(count ?? 0);
    });
    return () => { active = false; };
  }, [supabase]);

  return (
    <header className="flex items-start justify-between px-5 pb-2 pt-5">
      <div>
        <BrandLogo className="[&>span:first-child]:h-10 [&>span:first-child]:w-10 [&>span:last-child]:text-[26px]" />
        <p className="mt-5 text-[13px] text-[#666672]">Merhaba{firstName(user) ? `, ${firstName(user)}` : ""} 👋</p>
      </div>
      <Link href="/notifications" aria-label="Bildirimler" className="relative mt-1 grid h-10 w-10 place-items-center rounded-full text-[#15151A]">
        <Bell className="h-6 w-6" strokeWidth={1.8} />
        {unread > 0 && <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-[#EF4444] ring-2 ring-white" />}
      </Link>
    </header>
  );
}
