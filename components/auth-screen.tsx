"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  BadgeCheck,
  Building2,
  Check,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";
import { type FormEvent, useState } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { BRAND } from "@/config/brand";
import { authErrorMessage } from "@/lib/auth/messages";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type AuthMode = "signin" | "signup";
type AccountRole = "customer" | "business";

function AuthForm({ mode, role, next, initialError }: { mode: AuthMode; role: AccountRole; next?: string; initialError?: string }) {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState(initialError);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setErrorMessage(undefined);

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const fullName = String(form.get("full_name") ?? "").trim();
    const phone = String(form.get("phone") ?? "").trim();
    const city = String(form.get("city") ?? "").trim();
    const businessName = String(form.get("business_name") ?? "").trim();
    if (!email || password.length < 8) {
      setErrorMessage("Geçerli bir e-posta ve en az 8 karakterli şifre gir.");
      setPending(false);
      return;
    }
    if (mode === "signup" && (fullName.length < 2 || phone.length < 10 || !city || (role === "business" && businessName.length < 2))) {
      setErrorMessage("Ad soyad, geçerli telefon, şehir ve işletme bilgilerini eksiksiz gir.");
      setPending(false);
      return;
    }
    if (mode === "signup" && (form.get("terms_consent") !== "on" || form.get("kvkk_consent") !== "on")) {
      setErrorMessage("Devam etmek için kullanım şartları ve KVKK metnini kabul etmelisin.");
      setPending(false);
      return;
    }

    const supabase = createBrowserSupabaseClient();
    const fallback = role === "business"
      ? mode === "signup" ? "/business/onboarding" : "/business/dashboard"
      : "/";
    const destination = next?.startsWith("/") && !next.startsWith("//") ? next : fallback;

    if (!supabase) {
      router.replace(destination);
      router.refresh();
      return;
    }

    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setErrorMessage(authErrorMessage(error.code, "signin"));
        setPending(false);
        return;
      }
      router.replace(destination);
      router.refresh();
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { requested_role: role, full_name: fullName, phone, city, business_name: role === "business" ? businessName : undefined },
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(destination)}`,
      },
    });
    if (error) {
      setErrorMessage(authErrorMessage(error.code, "signup"));
      setPending(false);
      return;
    }
    if (data.user?.identities?.length === 0) {
      setErrorMessage("Bu e-posta adresiyle daha önce hesap oluşturulmuş.");
      setPending(false);
      return;
    }
    if (data.session) {
      await supabase.from("consents").insert([
        { user_id: data.session.user.id, document_type: "terms", document_version: "2026-08-18", granted: true },
        { user_id: data.session.user.id, document_type: "kvkk", document_version: "2026-08-18", granted: true },
        { user_id: data.session.user.id, document_type: "marketing", document_version: "2026-08-18", granted: form.get("marketing_consent") === "on" },
      ]);
      if (role === "business") {
        const { error: onboardingError } = await supabase.rpc("start_business_onboarding", { p_name: businessName, p_description: null });
        if (onboardingError) {
          setErrorMessage("Hesabın oluşturuldu ancak işletme profili başlatılamadı. Giriş yaparak tekrar deneyebilirsin.");
          setPending(false);
          return;
        }
      }
      router.replace(destination);
      router.refresh();
      return;
    }
    router.replace(`/auth/verify?email=${encodeURIComponent(email)}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 grid gap-4">
      <input type="hidden" name="role" value={role} />
      {next && <input type="hidden" name="next" value={next} />}

      {mode === "signup" && <>
        <label className="grid gap-2 text-sm font-medium" htmlFor={`${mode}-full-name`}>
          Ad soyad
          <span className="flex h-12 items-center gap-3 rounded-xl border border-[#DFDFE6] bg-white px-3 transition focus-within:border-[#6C4BF4] focus-within:ring-4 focus-within:ring-[#6C4BF4]/10"><UserRound className="h-4 w-4 shrink-0 text-[#8A8A94]" /><input id={`${mode}-full-name`} name="full_name" required minLength={2} autoComplete="name" placeholder="Adın ve soyadın" className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-[#B1B1BA]" /></span>
        </label>
        {role === "business" && <label className="grid gap-2 text-sm font-medium" htmlFor={`${mode}-business-name`}>
          İşletme adı
          <span className="flex h-12 items-center gap-3 rounded-xl border border-[#DFDFE6] bg-white px-3 transition focus-within:border-[#6C4BF4] focus-within:ring-4 focus-within:ring-[#6C4BF4]/10"><Building2 className="h-4 w-4 shrink-0 text-[#8A8A94]" /><input id={`${mode}-business-name`} name="business_name" required minLength={2} autoComplete="organization" placeholder="İşletmenin görünen adı" className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-[#B1B1BA]" /></span>
        </label>}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2 text-sm font-medium" htmlFor={`${mode}-phone`}>Telefon<span className="flex h-12 items-center gap-3 rounded-xl border border-[#DFDFE6] bg-white px-3 transition focus-within:border-[#6C4BF4] focus-within:ring-4 focus-within:ring-[#6C4BF4]/10"><Phone className="h-4 w-4 shrink-0 text-[#8A8A94]" /><input id={`${mode}-phone`} name="phone" type="tel" required minLength={10} autoComplete="tel" placeholder="+90 5xx..." className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-[#B1B1BA]" /></span></label>
          <label className="grid gap-2 text-sm font-medium" htmlFor={`${mode}-city`}>Şehir<span className="flex h-12 items-center gap-3 rounded-xl border border-[#DFDFE6] bg-white px-3 transition focus-within:border-[#6C4BF4] focus-within:ring-4 focus-within:ring-[#6C4BF4]/10"><MapPin className="h-4 w-4 shrink-0 text-[#8A8A94]" /><input id={`${mode}-city`} name="city" required autoComplete="address-level1" placeholder="İzmir" className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-[#B1B1BA]" /></span></label>
        </div>
      </>}

      <label className="grid gap-2 text-sm font-medium" htmlFor={`${mode}-email`}>
        E-posta
        <span className="flex h-12 items-center gap-3 rounded-xl border border-[#DFDFE6] bg-white px-3 transition focus-within:border-[#6C4BF4] focus-within:ring-4 focus-within:ring-[#6C4BF4]/10">
          <Mail className="h-4 w-4 shrink-0 text-[#8A8A94]" />
          <input
            id={`${mode}-email`}
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="ornek@email.com"
            className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-[#B1B1BA]"
          />
        </span>
      </label>

      {mode === "signup" && <div className="grid gap-2.5 rounded-xl bg-[#FAFAFC] p-3 text-xs leading-5 text-[#666672]">
        <label className="flex items-start gap-2.5"><input name="terms_consent" type="checkbox" required className="mt-1 accent-[#6C4BF4]" /><span><Link href="/terms" target="_blank" className="font-semibold text-[#6C4BF4] underline">Kullanım Şartları</Link>&apos;nı okudum ve kabul ediyorum.</span></label>
        <label className="flex items-start gap-2.5"><input name="kvkk_consent" type="checkbox" required className="mt-1 accent-[#6C4BF4]" /><span><Link href="/kvkk" target="_blank" className="font-semibold text-[#6C4BF4] underline">KVKK Aydınlatma Metni</Link>&apos;ni okudum.</span></label>
        <label className="flex items-start gap-2.5"><input name="marketing_consent" type="checkbox" className="mt-1 accent-[#6C4BF4]" /><span>Kampanya ve ürün duyurularını almak istiyorum. <span className="text-[#92929C]">(İsteğe bağlı)</span></span></label>
      </div>}

      <label className="grid gap-2 text-sm font-medium" htmlFor={`${mode}-password`}>
        <span className="flex items-center justify-between">
          Şifre
          {mode === "signup" && <span className="text-[11px] font-normal text-[#8A8A94]">En az 8 karakter</span>}
        </span>
        <span className="flex h-12 items-center gap-3 rounded-xl border border-[#DFDFE6] bg-white px-3 transition focus-within:border-[#6C4BF4] focus-within:ring-4 focus-within:ring-[#6C4BF4]/10">
          <LockKeyhole className="h-4 w-4 shrink-0 text-[#8A8A94]" />
          <input
            id={`${mode}-password`}
            name="password"
            type={showPassword ? "text" : "password"}
            required
            minLength={8}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            placeholder="••••••••"
            className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-[#B1B1BA]"
          />
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            aria-label={showPassword ? "Şifreyi gizle" : "Şifreyi göster"}
            className="rounded-lg p-1 text-[#8A8A94] transition hover:bg-[#F2F0FA] hover:text-[#6C4BF4]"
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </span>
      </label>

      {errorMessage && (
        <div role="alert" className="rounded-xl border border-[#FFD9DD] bg-[#FFF5F6] p-3 text-xs leading-5 text-[#B42332]">
          {errorMessage}
        </div>
      )}

      <button
        disabled={pending}
        className="mt-1 flex h-12 items-center justify-center rounded-xl bg-[#6C4BF4] text-sm font-semibold text-white shadow-[0_10px_24px_rgba(108,75,244,.22)] transition hover:bg-[#5635E6] disabled:cursor-wait disabled:opacity-60"
      >
        {pending ? "Lütfen bekleyin..." : mode === "signup" ? "Ücretsiz Hesap Oluştur" : "Giriş Yap"}
      </button>
    </form>
  );
}

function ComingSoonButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      disabled
      className="flex h-11 items-center justify-center gap-2 rounded-xl border border-[#E1E1E7] bg-[#FAFAFC] px-3 text-xs font-semibold text-[#777781]"
    >
      {label}
      <span className="rounded-md bg-[#EEEAFD] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#6C4BF4]">Yakında</span>
    </button>
  );
}

export function AuthScreen({ initialMode, initialRole = "customer", next, initialError }: { initialMode: AuthMode; initialRole?: AccountRole; next?: string; initialError?: string }) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [role, setRole] = useState<AccountRole>(initialRole);
  const signup = mode === "signup";

  return (
    <main className="grid min-h-screen bg-white lg:grid-cols-[minmax(480px,0.92fr)_minmax(520px,1.08fr)]">
      <section className="flex min-h-screen flex-col px-5 py-6 sm:px-10 lg:px-14 xl:px-20">
        <div className="flex items-center justify-between">
          <BrandLogo />
          <Link href="/" className="flex items-center gap-2 rounded-lg px-2 py-2 text-xs font-semibold text-[#777781] transition hover:bg-[#F7F7FA] hover:text-[#15151A]">
            <ArrowLeft className="h-4 w-4" /> Ana sayfa
          </Link>
        </div>

        <div className="relative mx-auto mt-6 h-36 w-full max-w-md overflow-hidden rounded-[22px] lg:hidden">
          <Image
            src="https://images.unsplash.com/photo-1560066984-138dadb4c035?w=1000&auto=format&fit=crop&q=86"
            alt={`Modern ${BRAND.name} kuaför salonu`}
            fill
            priority
            sizes="(max-width: 1023px) 90vw, 1px"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#17151F]/85 via-[#17151F]/30 to-transparent" />
          <div className="absolute inset-y-0 left-0 flex max-w-[72%] flex-col justify-center p-5 text-white">
            <span className="text-[10px] font-semibold uppercase tracking-[.14em] text-white/70">{BRAND.name}</span>
            <strong className="mt-1 text-lg leading-6">İyi hizmet, tek dokunuş uzağında.</strong>
          </div>
        </div>

        <div className="mx-auto my-auto w-full max-w-md py-10">
          <span className="inline-flex items-center gap-2 rounded-full bg-[#F1EDFF] px-3 py-1.5 text-[11px] font-semibold text-[#6041DB]">
            <ShieldCheck className="h-3.5 w-3.5" /> Güvenli hesap erişimi
          </span>
          <h1 className="mt-5 text-3xl font-bold tracking-[-.035em] sm:text-[34px]">
            {signup ? `${BRAND.name}'ye katıl` : "Tekrar hoş geldin"}
          </h1>
          <p className="mt-2 text-sm leading-6 text-[#777781]">
            {signup ? "Ücretsiz hesabını oluştur, iyi hizmete daha hızlı ulaş." : "Randevularına ve favorilerine kaldığın yerden devam et."}
          </p>

          <div className="mt-7 grid grid-cols-2 rounded-xl bg-[#F4F4F7] p-1" aria-label="Hesap türü">
            <button type="button" onClick={() => setRole("customer")} className={cn("rounded-lg px-3 py-2.5 text-xs font-semibold transition", role === "customer" ? "bg-white text-[#5B3BE7] shadow-sm" : "text-[#777781]")}>Müşteriyim</button>
            <button type="button" onClick={() => setRole("business")} className={cn("rounded-lg px-3 py-2.5 text-xs font-semibold transition", role === "business" ? "bg-white text-[#5B3BE7] shadow-sm" : "text-[#777781]")}>İşletmeyim</button>
          </div>

          <AuthForm key={`${mode}-${role}`} mode={mode} role={role} next={next} initialError={initialError} />

          <div className="my-6 flex items-center gap-3 text-[11px] text-[#A1A1AA]"><span className="h-px flex-1 bg-[#E8E8EE]" />veya<span className="h-px flex-1 bg-[#E8E8EE]" /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <ComingSoonButton label="Google ile devam et" />
            <ComingSoonButton label="Apple ile devam et" />
          </div>

          <p className="mt-7 text-center text-sm text-[#777781]">
            {signup ? "Zaten hesabın var mı?" : "Henüz hesabın yok mu?"}{" "}
            <button type="button" onClick={() => setMode(signup ? "signin" : "signup")} className="font-semibold text-[#6C4BF4] hover:text-[#5635E6]">
              {signup ? "Giriş yap" : "Ücretsiz kayıt ol"}
            </button>
          </p>
          <p className="mt-5 text-center text-[10px] leading-5 text-[#91919A]">
            Devam ederek <Link href="/terms" className="underline">Kullanım Şartları</Link> ve <Link href="/kvkk" className="underline">KVKK Aydınlatma Metni</Link>&apos;ni kabul edersin.
          </p>
        </div>
      </section>

      <section className="relative hidden min-h-screen overflow-hidden bg-[#17151F] text-white lg:block">
        <Image
          src="https://images.unsplash.com/photo-1560066984-138dadb4c035?w=1600&auto=format&fit=crop&q=88"
          alt={`Modern ${BRAND.name} kuaför salonu`}
          fill
          priority
          sizes="55vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#131018] via-[#17151F]/35 to-[#17151F]/5" />
        <div className="absolute inset-x-0 bottom-0 p-10 xl:p-16">
          <div className="max-w-xl rounded-[28px] border border-white/15 bg-[#17151F]/72 p-7 shadow-2xl backdrop-blur-xl xl:p-9">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/12 px-3 py-1.5 text-[11px] font-semibold text-white/90">
              <Sparkles className="h-3.5 w-3.5 text-[#B7A5FF]" /> Türkiye&apos;nin hizmet pazaryeri
            </span>
            <h2 className="mt-5 max-w-lg text-3xl font-bold tracking-[-.04em] xl:text-4xl">İyi hizmete giden en kısa yol.</h2>
            <p className="mt-3 max-w-lg text-sm leading-6 text-white/70 xl:text-base xl:leading-7">Doğrulanmış işletmeleri keşfet, uygun saati seç ve randevunu tek yerden yönet.</p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <span className="flex items-center gap-2 text-xs text-white/80"><Check className="h-4 w-4 text-[#8FE3AB]" /> Doğrulanmış yorumlar</span>
              <span className="flex items-center gap-2 text-xs text-white/80"><Check className="h-4 w-4 text-[#8FE3AB]" /> Güvenli randevu akışı</span>
            </div>
            <div className="mt-7 flex items-center gap-3 border-t border-white/10 pt-5">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-[#6C4BF4]"><BadgeCheck className="h-5 w-5" /></span>
              <div><strong className="block text-sm">500+ seçkin işletme</strong><span className="text-[11px] text-white/55">İzmir&apos;de keşfetmeye hazır</span></div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
