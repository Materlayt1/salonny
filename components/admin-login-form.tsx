"use client";

import { Eye, EyeOff, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { authErrorMessage } from "@/lib/auth/messages";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export function AdminLoginForm() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const supabase = createBrowserSupabaseClient();
    if (!supabase) { setError("Supabase bağlantısı yapılandırılmamış."); setPending(false); return; }

    const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError || !data.user) { setError(authErrorMessage(signInError?.code, "signin")); setPending(false); return; }
    const { data: profile } = await supabase.from("users").select("role").eq("id", data.user.id).maybeSingle();
    if (profile?.role !== "ADMIN") {
      await supabase.auth.signOut();
      setError("Bu hesap yönetici paneline erişim yetkisine sahip değil.");
      setPending(false);
      return;
    }
    router.replace("/admin");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="mt-7 grid gap-4">
      <label className="grid gap-2 text-sm font-medium">Yönetici e-postası<span className="flex h-12 items-center gap-3 rounded-xl border border-[#DFDFE6] px-3 focus-within:border-[#6C4BF4] focus-within:ring-4 focus-within:ring-[#6C4BF4]/10"><Mail className="h-4 w-4 text-[#8A8A94]" /><input name="email" type="email" required autoComplete="username" className="min-w-0 flex-1 outline-none" placeholder="admin@salonny.app" /></span></label>
      <label className="grid gap-2 text-sm font-medium">Özel şifre<span className="flex h-12 items-center gap-3 rounded-xl border border-[#DFDFE6] px-3 focus-within:border-[#6C4BF4] focus-within:ring-4 focus-within:ring-[#6C4BF4]/10"><LockKeyhole className="h-4 w-4 text-[#8A8A94]" /><input name="password" type={showPassword ? "text" : "password"} required minLength={12} autoComplete="current-password" className="min-w-0 flex-1 outline-none" placeholder="••••••••••••" /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Şifreyi gizle" : "Şifreyi göster"}>{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></span></label>
      {error && <div role="alert" className="rounded-xl border border-[#FFD9DD] bg-[#FFF5F6] p-3 text-xs text-[#B42332]">{error}</div>}
      <button disabled={pending} className="mt-1 flex h-12 items-center justify-center gap-2 rounded-xl bg-[#6C4BF4] text-sm font-semibold text-white shadow-[0_10px_24px_rgba(108,75,244,.22)] disabled:opacity-60"><ShieldCheck className="h-4 w-4" />{pending ? "Yetki kontrol ediliyor..." : "Admin Paneline Gir"}</button>
    </form>
  );
}
