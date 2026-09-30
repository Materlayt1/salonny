"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { getSessionSummary, type SessionSummary } from "@/lib/session-summary-client";

function firstName(summary: SessionSummary | null) {
  return summary?.authenticated ? summary.displayName?.trim().split(/\s+/)[0] ?? "" : "";
}

export function MobileHomeHeader() {
  const [summary, setSummary] = useState<SessionSummary | null>(null);

  useEffect(() => {
    let active = true;
    void getSessionSummary().then((value) => { if (active) setSummary(value); });
    return () => { active = false; };
  }, []);

  const unread = summary?.unreadCount ?? 0;

  return (
    <header className="flex items-start justify-between px-5 pb-2 pt-5">
      <div>
        <BrandLogo className="[&>span:first-child]:h-10 [&>span:first-child]:w-10 [&>span:last-child]:text-[26px]" />
        <p className="mt-5 text-[13px] text-[#666672]">Merhaba{firstName(summary) ? `, ${firstName(summary)}` : ""} 👋</p>
      </div>
      <Link href="/notifications" aria-label="Bildirimler" className="relative mt-1 grid h-10 w-10 place-items-center rounded-full text-[#15151A]">
        <Bell className="h-6 w-6" strokeWidth={1.8} />
        {unread > 0 && <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-[#EF4444] ring-2 ring-white" />}
      </Link>
    </header>
  );
}
