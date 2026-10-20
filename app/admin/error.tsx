"use client";
import Link from "next/link";
export default function AdminError({ reset }: { reset: () => void }) {
  return <main className="mx-auto max-w-xl p-8"><h1 className="text-2xl font-semibold">Yönetim alanı alınamadı</h1><p role="alert" className="mt-4 text-sm leading-6 text-[#767080]">Oturum veya veri servisi şu anda doğrulanamıyor. Kayıtlar boş ya da silinmiş sayılmıyor; hiçbir yönetim işlemi otomatik tekrarlanmayacak.</p><div className="mt-6 flex flex-wrap gap-3"><button onClick={reset} className="min-h-11 rounded-xl bg-[#6C4BF4] px-5 text-sm text-white">Yeniden dene</button><Link href="/admin/login" prefetch={false} className="inline-flex min-h-11 items-center px-4 text-sm text-[#6C4BF4]">Yönetici girişine dön</Link></div></main>;
}
