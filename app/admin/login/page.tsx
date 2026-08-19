import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, LockKeyhole, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { AdminLoginForm } from "@/components/admin-login-form";
import { BrandLogo } from "@/components/brand-logo";
import { BRAND } from "@/config/brand";
import { createServerClientOptional } from "@/lib/supabase/server";

export default async function AdminLoginPage() {
  const supabase = await createServerClientOptional();
  if (supabase) {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase.from("users").select("role").eq("id", user.id).maybeSingle();
      if (data?.role === "ADMIN") redirect("/admin");
    }
  }
  return (
    <main className="grid min-h-screen bg-white lg:grid-cols-[minmax(460px,.88fr)_minmax(540px,1.12fr)]">
      <section className="flex min-h-screen flex-col px-6 py-7 sm:px-12 lg:px-16 xl:px-24">
        <div className="flex items-center justify-between"><BrandLogo /><Link href="/" className="flex items-center gap-2 text-xs font-semibold text-[#777781]"><ArrowLeft className="h-4 w-4" /> Ana sayfa</Link></div>
        <div className="mx-auto my-auto w-full max-w-md py-12">
          <span className="inline-flex items-center gap-2 rounded-full bg-[#F0ECFF] px-3 py-1.5 text-[11px] font-semibold text-[#5B3BE7]"><ShieldCheck className="h-3.5 w-3.5" /> Yetkili erişim</span>
          <h1 className="mt-5 text-3xl font-bold tracking-[-.04em]">{BRAND.name} Admin</h1>
          <p className="mt-2 text-sm leading-6 text-[#777781]">İşletme başvurularını, kullanıcıları, randevuları ve moderasyon işlemlerini güvenli panelden yönet.</p>
          <AdminLoginForm />
          <p className="mt-6 flex items-start gap-2 rounded-xl bg-[#FAFAFC] p-3 text-[11px] leading-5 text-[#777781]"><LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Yönetici hesabı normal kayıt ekranından oluşturulamaz ve yalnızca ADMIN rolüyle giriş yapabilir.</p>
        </div>
      </section>
      <section className="relative hidden overflow-hidden bg-[#17151F] lg:block"><Image src="https://images.unsplash.com/photo-1552664730-d307ca884978?w=1600&auto=format&fit=crop&q=88" alt={`${BRAND.name} operasyon ekibi`} fill priority className="object-cover opacity-70" sizes="56vw" /><div className="absolute inset-0 bg-gradient-to-t from-[#17151F] via-[#17151F]/35 to-transparent" /><div className="absolute inset-x-0 bottom-0 p-12 text-white xl:p-16"><span className="text-xs font-semibold uppercase tracking-[.16em] text-white/60">Operasyon merkezi</span><h2 className="mt-4 max-w-xl text-4xl font-bold tracking-[-.045em]">Platformun kontrolü tek, güvenli merkezde.</h2></div></section>
    </main>
  );
}
