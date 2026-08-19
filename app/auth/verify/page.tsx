import Link from "next/link";
import { MailCheck } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { BRAND } from "@/config/brand";

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const { email } = await searchParams;
  return (
    <main className="grid min-h-screen place-items-center bg-[#F8F8FA] p-4">
      <div className="surface soft-shadow w-full max-w-md p-8 text-center">
        <BrandLogo className="justify-center" />
        <span className="mx-auto mt-8 grid h-16 w-16 place-items-center rounded-2xl bg-[#EAFBF0] text-[#16A34A]"><MailCheck className="h-8 w-8" /></span>
        <h1 className="mt-5 text-2xl font-bold">E-postanı kontrol et</h1>
        <p className="mt-2 text-sm leading-6 text-[#777781]">
          {email ? <><strong className="font-semibold text-[#44444C]">{email}</strong> adresine</> : "E-posta adresine"} güvenli bir doğrulama bağlantısı gönderdik.
        </p>
        <p className="mt-3 text-xs leading-5 text-[#96969F]">E-posta görünmüyorsa spam klasörünü kontrol et. Bağlantı seni güvenli şekilde {BRAND.name}&apos;ye geri getirecek.</p>
        <Link href="/auth/login" className="mt-6 inline-flex h-11 items-center justify-center rounded-xl border border-[#E2E2E8] px-5 text-sm font-semibold text-[#6C4BF4]">Girişe dön</Link>
      </div>
    </main>
  );
}
