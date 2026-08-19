"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export function AdminSignOut() {
  const router = useRouter();
  async function signOut() {
    await createBrowserSupabaseClient()?.auth.signOut();
    router.replace("/admin/login");
    router.refresh();
  }
  return <button type="button" onClick={() => void signOut()} className="flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs text-white/65 transition hover:bg-white/10 hover:text-white"><LogOut className="h-4 w-4" /> Çıkış yap</button>;
}
