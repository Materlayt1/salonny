"use client";
import Link from "next/link";
export function BusinessReadError({ retry }: { retry: () => void }) {
  return <main className="grid min-h-[75vh] place-items-center p-6"><section className="surface max-w-lg p-8 text-center"><h1 className="text-2xl font-semibold">İşletme bilgileri şu anda alınamıyor</h1><p role="alert" className="mt-4 text-sm leading-6 text-[#686872]">Bu, işletmenin silindiği anlamına gelmez. Bağlantı veya veri servisi geçici olarak yanıt vermiyor olabilir.</p><button onClick={retry} className="mt-6 min-h-11 rounded-xl bg-[#6C4BF4] px-5 text-white">Yeniden dene</button><Link prefetch={false} href="/kesfet" className="ml-3 inline-flex min-h-11 items-center text-sm text-[#6C4BF4]">Keşfete dön</Link></section></main>;
}
