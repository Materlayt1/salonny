import Link from "next/link";
export function BusinessUnavailable() {
  return <main className="grid min-h-[75vh] place-items-center p-6"><section className="surface max-w-lg p-8 text-center"><h1 className="text-2xl font-semibold">İşletme şu anda yayında değil</h1><p className="mt-4 text-sm leading-6 text-[#686872]">Bu işletme yayından kaldırılmış veya artık mevcut olmayabilir. Diğer işletmeleri keşfedebilirsin.</p><Link prefetch={false} href="/kesfet" className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-[#6C4BF4] px-5 text-white">İşletmeleri keşfet</Link></section></main>;
}
