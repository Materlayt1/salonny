import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function SectionHeading({ title, description, href }: { title: string; description?: string; href?: string }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div><h2 className="text-xl font-bold tracking-[-.02em] md:text-2xl">{title}</h2>{description && <p className="mt-1 text-sm text-[#777781]">{description}</p>}</div>
      {href && <Link href={href} className="flex shrink-0 items-center gap-1 text-xs font-semibold text-[#6C4BF4]">Tümünü gör <ArrowRight className="h-3.5 w-3.5" /></Link>}
    </div>
  );
}
