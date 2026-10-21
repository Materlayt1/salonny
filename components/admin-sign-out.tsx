"use client";

import { LogOut } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export function AdminSignOut({ inverse = true }: { inverse?: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  async function signOut() {
    if (pending) return;
    setPending(true); setError(false);
    try {
      const result = await createBrowserSupabaseClient()?.auth.signOut();
      if (result?.error) throw result.error;
      router.replace("/admin/login");
      router.refresh();
    } catch { setError(true); } finally { setPending(false); }
  }
  return <div><button disabled={pending} type="button" onClick={() => void signOut()} className={"flex min-h-11 items-center gap-2 rounded-xl border px-3 py-2 text-xs transition disabled:opacity-50 " + (inverse ? "border-white/10 text-white/65 hover:bg-white/10 hover:text-white" : "border-[#E2E2E8] text-[#64616D] hover:bg-[#F3EFFF]")}><LogOut className="h-4 w-4" />{pending ? "Çıkılıyor…" : "Çıkış yap"}</button>{error && <p role="alert" className="mt-2 text-xs text-red-500">Çıkış tamamlanamadı. Yeniden dene.</p>}</div>;
}
