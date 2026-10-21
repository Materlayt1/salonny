"use client";

import { type FormEvent, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";

const subscribe = () => () => {};
export function DeleteAccountForm({ email }: { email: string }) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const busy = useRef(false);
  const hydrated = useSyncExternalStore(subscribe, () => true, () => false);

  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hydrated || busy.current || message) return;
    const form = new FormData(event.currentTarget);
    if (String(form.get("email") ?? "").trim().toLocaleLowerCase("tr-TR") !== email.toLocaleLowerCase("tr-TR") || form.get("confirmed") !== "on") {
      setError("E-posta adresini doğru girip onay kutusunu işaretlemelisin.");
      return;
    }
    busy.current = true;
    setPending(true); setError(undefined); setMessage(undefined);
    try {
      const response = await fetch("/api/customer-profile", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmed: true, reason: String(form.get("reason") ?? "").trim() }), signal: AbortSignal.timeout(15_000) });
      const result = await response.json();
      if (!response.ok || result.requested !== true) throw new Error(result.error ?? "Talep sonucu doğrulanamadı. Profilini yenile.");
      setMessage("Silme talebin alındı. Sahibi olduğun işletmeler yayından çekildi; talep sonuçlanana kadar yeniden yayımlanamaz. Hesabın ve randevu geçmişin henüz silinmedi.");
    } catch (error) { setError(error instanceof DOMException ? "Bağlantı kesildi veya yanıt gecikti. Talebin sonucunu doğrulamak için profilini yenile." : error instanceof Error ? error.message : "Talep sonucu doğrulanamadı. Profilini yenile."); }
    finally { setPending(false); busy.current = false; }
  }

  return <form method="post" onSubmit={submitRequest}><fieldset disabled={!hydrated || pending || Boolean(message)} className="grid min-w-0 gap-4"><h2>Silme talebi</h2>{message && <div className="rounded-xl border border-[#CDEFD8] bg-[#F1FCF5] p-3 text-sm text-[#147A37]">{message}</div>}{error && <div role="alert" className="rounded-xl border border-[#FFD7DB] bg-[#FFF5F6] p-3 text-sm text-[#B42332]">{error}</div>}<label className="grid gap-2 text-sm font-medium">Onay için e-posta adresin<input name="email" type="email" required className="h-12 rounded-xl border border-[#E1E1E7] px-3 outline-none focus:border-[#6C4BF4]" placeholder={email} /></label><label className="grid gap-2 text-sm font-medium">Ayrılma nedenin <span className="text-xs font-normal text-[#8A8A94]">İsteğe bağlı</span><textarea name="reason" maxLength={1000} className="min-h-24 rounded-xl border border-[#E1E1E7] p-3 outline-none focus:border-[#6C4BF4]" /></label><label className="flex items-start gap-3"><input name="confirmed" type="checkbox" className="mt-1 accent-[#DC3545]" /> Hesabımın ve ilişkili kişisel verilerimin silinmesini istediğimi onaylıyorum.</label><Button type="submit" variant="danger" disabled={pending} className="mt-1 sm:w-fit">{pending ? "Talep oluşturuluyor..." : "Silme Talebi Oluştur"}</Button></fieldset><noscript>Silme talebini güvenli göndermek için JavaScript gerekir.</noscript></form>;
}
