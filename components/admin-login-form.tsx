"use client";

import { Eye, EyeOff, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState, useSyncExternalStore } from "react";
import { authErrorMessage } from "@/lib/auth/messages";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

const subscribe = () => () => {};
export function AdminLoginForm() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const hydrated = useSyncExternalStore(subscribe, () => true, () => false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hydrated || pending) return;
    setPending(true);
    setError(undefined);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const supabase = createBrowserSupabaseClient();
    if (!supabase) { setError("Supabase bağlantısı yapılandırılmamış."); setPending(false); return; }

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError || !data.user) { setError(authErrorMessage(signInError?.code, "signin", signInError?.status)); return; }
      const { data: profile, error: profileError } = await supabase.from("users").select("role,deleted_at").eq("id", data.user.id).maybeSingle();
      if (profileError) { setError("Yönetici yetkisi şu anda doğrulanamıyor. Yeniden dene."); return; }
      if (profile?.role !== "ADMIN" || profile.deleted_at) {
        await supabase.auth.signOut();
        setError("Bu hesap yönetici paneline erişim yetkisine sahip değil.");
        return;
      }
      router.replace("/admin"); router.refresh();
    } catch { setError("Giriş şu anda tamamlanamadı. Yeniden dene."); }
    finally { setPending(false); }
  }

  return (
    <form method="post" onSubmit={submit} className="mt-7">
      <fieldset disabled={!hydrated || pending} className="grid min-w-0 gap-4">
      <label className="grid gap-2 text-sm font-medium">Yönetici e-postası<span className="flex h-12 items-center gap-3 rounded-xl border border-[#DFDFE6] px-3 focus-within:border-[#6C4BF4] focus-within:ring-4 focus-within:ring-[#6C4BF4]/10"><Mail className="h-4 w-4 text-[#8A8A94]" /><input name="email" type="email" required autoComplete="username" className="min-w-0 flex-1 outline-none" placeholder="admin@salonny.app" /></span></label>
      <label className="grid gap-2 text-sm font-medium">Özel şifre<span className="flex h-12 items-center gap-3 rounded-xl border border-[#DFDFE6] px-3 focus-within:border-[#6C4BF4] focus-within:ring-4 focus-within:ring-[#6C4BF4]/10"><LockKeyhole className="h-4 w-4 text-[#8A8A94]" /><input name="password" type={showPassword ? "text" : "password"} required minLength={12} autoComplete="current-password" className="min-w-0 flex-1 outline-none" placeholder="••••••••••••" /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Şifreyi gizle" : "Şifreyi göster"}>{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></span></label>
      {error && <div role="alert" className="rounded-xl border border-[#FFD9DD] bg-[#FFF5F6] p-3 text-xs text-[#B42332]">{error}</div>}
      <button disabled={pending} className="mt-1 flex h-12 items-center justify-center gap-2 rounded-xl bg-[#6C4BF4] text-sm font-semibold text-white shadow-[0_10px_24px_rgba(108,75,244,.22)] disabled:opacity-60"><ShieldCheck className="h-4 w-4" />{pending ? "Yetki kontrol ediliyor..." : "Admin Paneline Gir"}</button>
      </fieldset>
      <noscript>Güvenli yönetici girişi için JavaScript gerekir.</noscript>
    </form>
  );
}
