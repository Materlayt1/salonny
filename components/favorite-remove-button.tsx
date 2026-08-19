"use client";

import { Heart } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export function FavoriteRemoveButton({ businessId }: { businessId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function remove() {
    const supabase = createBrowserSupabaseClient();
    if (!supabase) return;
    setPending(true);
    await supabase.from("favorites").delete().eq("business_id", businessId);
    router.refresh();
    setPending(false);
  }

  return <button onClick={() => void remove()} disabled={pending} aria-label="Favorilerden çıkar" className="grid h-9 w-9 place-items-center rounded-full bg-[#F4F1FF] text-[#6C4BF4] transition hover:bg-[#EAE4FF] disabled:opacity-50"><Heart className="h-4 w-4 fill-current" /></button>;
}
