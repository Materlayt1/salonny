import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";

export function LegalPage({ title, updated = "18 Ağustos 2026", children }: { title: string; updated?: string; children: React.ReactNode }) {
  return <div className="min-h-screen bg-white"><header className="border-b border-[#ECECF1]"><div className="container-shell flex h-[72px] items-center"><BrandLogo /><Link href="/" className="ml-auto text-xs font-semibold text-[#6C4BF4]">Ana sayfaya dön</Link></div></header><main className="container-shell max-w-3xl py-12 md:py-16"><h1 className="text-4xl font-bold tracking-[-.04em]">{title}</h1><p className="mt-3 text-xs text-[#8A8A94]">Son güncelleme: {updated}</p><article className="mt-10 space-y-8 text-sm leading-7 text-[#555560] [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-[#15151A] [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5">{children}</article></main></div>;
}
