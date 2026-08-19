"use client";

import { useEffect } from "react";
import { AlertCircle, RotateCcw } from "lucide-react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return <main className="grid min-h-[70vh] place-items-center bg-[#F8F8FA] p-6"><section className="surface max-w-md p-8 text-center"><span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#FFF0F1] text-[#C72C3B]"><AlertCircle className="h-6 w-6" /></span><h1 className="mt-5 text-2xl font-bold">Bir şeyler ters gitti</h1><p className="mt-3 text-sm leading-6 text-[#777781]">İşlemin tamamlanamadı. Verilerin güvende; sayfayı yeniden deneyebilirsin.</p><button onClick={reset} className="mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#6C4BF4] px-5 text-sm font-semibold text-white"><RotateCcw className="h-4 w-4" /> Tekrar dene</button></section></main>;
}
