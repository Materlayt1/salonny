"use client";

import { Heart } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { invalidateSessionSummary } from "@/lib/session-summary-client";

export function FavoriteRemoveButton({ businessId }: { businessId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function remove() {
    setPending(true);
    const response = await fetch(`/api/favorites/${businessId}`, { method: "DELETE" });
    if (response.ok) {
      invalidateSessionSummary();
      router.refresh();
    }
    setPending(false);
  }

  return <button onClick={() => void remove()} disabled={pending} aria-label="Favorilerden çıkar" className="grid h-9 w-9 place-items-center rounded-full bg-[#F4F1FF] text-[#6C4BF4] transition hover:bg-[#EAE4FF] disabled:opacity-50"><Heart className="h-4 w-4 fill-current" /></button>;
}
