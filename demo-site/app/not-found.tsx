import Link from "next/link";

export default function NotFound() {
  return <main className="grid min-h-screen place-items-center bg-[#F8F8FA] p-4"><div className="surface max-w-md p-8 text-center"><h1 className="text-2xl font-bold">Sayfa bulunamadı</h1><p className="mt-3 text-sm text-[#777781]">Görsel demodaki işletmeleri keşfetmeye devam edebilirsin.</p><Link href="/kesfet" className="mt-6 inline-flex h-11 items-center rounded-xl bg-[#6C4BF4] px-5 text-sm font-semibold text-white">Keşfete dön</Link></div></main>;
}
