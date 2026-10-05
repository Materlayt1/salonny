"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const client = useMemo(() => createBrowserSupabaseClient(), []);
  const [ready, setReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    if (!client) { queueMicrotask(() => { if (active) setReady(true); }); return; }
    const { data: listener } = client.auth.onAuthStateChange((_event, session) => { if (active) { setHasSession(Boolean(session)); setReady(true); } });
    void client.auth.getSession().then(({ data }) => { if (active) { setHasSession(Boolean(data.session)); setReady(true); } }).catch(() => { if (active) setReady(true); });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, [client]);

  async function submit(event: FormEvent) {
    event.preventDefault(); setError(""); setMessage("");
    if (!client) { setError("Giriş servisine şu anda ulaşılamıyor."); return; }
    if (hasSession && (password.length < 8 || password !== confirmation)) { setError("En az 8 karakterli şifre gir ve iki alanın eşleştiğinden emin ol."); return; }
    setBusy(true);
    try {
      if (hasSession) {
        const { error } = await client.auth.updateUser({ password });
        if (error) throw error;
        setMessage("Şifren güncellendi. Mobil uygulamaya yeni şifrenle giriş yapabilirsin.");
        setPassword(""); setConfirmation("");
      } else {
        const { error } = await client.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/auth/reset-password` });
        if (error) throw error;
        setMessage("Hesabın varsa şifre yenileme bağlantısı e-posta adresine gönderildi. Spam klasörünü de kontrol et.");
      }
    } catch { setError("İşlem tamamlanamadı. Bağlantıyı yeniden aç veya biraz sonra tekrar dene."); }
    finally { setBusy(false); }
  }
  return <main className="grid min-h-screen place-items-center bg-[#F7F7FA] p-5"><section className="surface w-full max-w-md p-7"><BrandLogo /><h1 className="mt-7 text-2xl font-bold">Şifreni yenile</h1><p className="mt-2 text-sm text-[#686872]">{hasSession ? "Yeni şifreni belirle." : "Şifre yenileme bağlantısını e-posta adresine gönder."}</p>{!ready ? <p className="mt-5">Bağlantı kontrol ediliyor...</p> : <form onSubmit={submit} className="mt-6 grid gap-4">
    {hasSession ? <><label className="grid gap-2 text-sm">Yeni şifre<input aria-label="Yeni şifre" type="password" required minLength={8} autoComplete="new-password" className="h-12 rounded-xl border px-3" value={password} onChange={(event) => setPassword(event.target.value)} /></label><label className="grid gap-2 text-sm">Yeni şifre tekrar<input aria-label="Yeni şifre tekrar" type="password" required minLength={8} autoComplete="new-password" className="h-12 rounded-xl border px-3" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label></> : <label className="grid gap-2 text-sm">E-posta<input type="email" required autoComplete="email" className="h-12 rounded-xl border px-3" value={email} onChange={(event) => setEmail(event.target.value)} /></label>}
    {error ? <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}{message ? <p role="status" className="rounded-xl bg-green-50 p-3 text-sm text-green-800">{message}</p> : null}
    <button disabled={busy} className="h-12 rounded-xl bg-[#6C4BF4] font-semibold text-white disabled:opacity-50">{busy ? "Lütfen bekleyin..." : hasSession ? "Şifreyi güncelle" : "Bağlantı gönder"}</button>
  </form>}<Link href="/auth/login" className="mt-5 block text-center text-sm text-[#6C4BF4]">Giriş ekranına dön</Link></section></main>;
}
