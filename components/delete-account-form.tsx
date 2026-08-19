"use client";

import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export function DeleteAccountForm({ userId, email }: { userId: string; email: string }) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();

  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (String(form.get("email") ?? "").trim().toLocaleLowerCase("tr-TR") !== email.toLocaleLowerCase("tr-TR") || form.get("confirmed") !== "on") {
      setError("E-posta adresini doğru girip onay kutusunu işaretlemelisin.");
      return;
    }
    const supabase = createBrowserSupabaseClient();
    if (!supabase) { setError("Supabase bağlantısı kurulamadı."); return; }
    setPending(true); setError(undefined); setMessage(undefined);
    const { error: insertError } = await supabase.from("account_deletion_requests").insert({ user_id: userId, reason: String(form.get("reason") ?? "").trim() || null, status: "requested" });
    setPending(false);
    if (insertError?.code === "23505") setMessage("Hesabın için zaten açık bir silme talebi bulunuyor.");
    else if (insertError) setError("Silme talebi oluşturulamadı. Lütfen tekrar dene.");
    else setMessage("Silme talebin alındı. İnceleme sırasında e-posta ile bilgilendirileceksin.");
  }

  return <form onSubmit={submitRequest} className="grid gap-4"><h2>Silme talebi</h2>{message && <div className="rounded-xl border border-[#CDEFD8] bg-[#F1FCF5] p-3 text-sm text-[#147A37]">{message}</div>}{error && <div role="alert" className="rounded-xl border border-[#FFD7DB] bg-[#FFF5F6] p-3 text-sm text-[#B42332]">{error}</div>}<label className="grid gap-2 text-sm font-medium">Onay için e-posta adresin<input name="email" type="email" required className="h-12 rounded-xl border border-[#E1E1E7] px-3 outline-none focus:border-[#6C4BF4]" placeholder={email} /></label><label className="grid gap-2 text-sm font-medium">Ayrılma nedenin <span className="text-xs font-normal text-[#8A8A94]">İsteğe bağlı</span><textarea name="reason" maxLength={1000} className="min-h-24 rounded-xl border border-[#E1E1E7] p-3 outline-none focus:border-[#6C4BF4]" /></label><label className="flex items-start gap-3"><input name="confirmed" type="checkbox" className="mt-1 accent-[#DC3545]" /> Hesabımın ve ilişkili kişisel verilerimin silinmesini istediğimi onaylıyorum.</label><Button type="submit" variant="danger" disabled={pending} className="mt-1 sm:w-fit">{pending ? "Talep oluşturuluyor..." : "Silme Talebi Oluştur"}</Button></form>;
}
