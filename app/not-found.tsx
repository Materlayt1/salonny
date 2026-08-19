import { SearchX } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";

export default function NotFound() { return <main className="grid min-h-[70vh] place-items-center bg-[#F8F8FA] p-6"><section className="surface max-w-md p-8 text-center"><SearchX className="mx-auto h-10 w-10 text-[#6C4BF4]" /><h1 className="mt-5 text-2xl font-bold">Sayfa bulunamadı</h1><p className="mt-3 text-sm text-[#777781]">Aradığın sayfa kaldırılmış veya adresi değişmiş olabilir.</p><ButtonLink href="/" className="mt-6">Ana sayfaya dön</ButtonLink></section></main>; }
