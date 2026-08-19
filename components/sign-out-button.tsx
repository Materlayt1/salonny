"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleSignOut() {
    setPending(true);
    const supabase = createBrowserSupabaseClient();
    if (supabase) await supabase.auth.signOut();
    router.replace("/auth/login");
    router.refresh();
  }

  return (
    <button disabled={pending} onClick={handleSignOut} className="flex w-full items-center gap-4 p-4 text-left transition hover:bg-[#FCFCFE] disabled:cursor-wait disabled:opacity-60">
      <LogOut className="h-5 w-5" />
      <span className="text-sm font-medium">{pending ? "Çıkış yapılıyor..." : "Çıkış yap"}</span>
    </button>
  );
}
