import Image from "next/image";
import Link from "next/link";
import { BRAND_NAME } from "@/config/brand";
import { cn } from "@/lib/utils";

export function BrandLogo({ compact = false, inverse = false, className }: { compact?: boolean; inverse?: boolean; className?: string }) {
  return (
    <Link href="/" aria-label={`${BRAND_NAME} ana sayfa`} className={cn("inline-flex items-center gap-2.5", className)}>
      <span className="relative block h-9 w-9 shrink-0 overflow-hidden rounded-xl shadow-[0_4px_12px_rgba(108,75,244,.22)]">
        <Image src="/brand/salonny-mark.png" alt="" fill className="object-cover" sizes="40px" />
      </span>
      {!compact && <span className={cn("text-[22px] font-bold tracking-[-.04em]", inverse ? "text-white" : "text-[#5C3DE2]")}>{BRAND_NAME.toLowerCase()}</span>}
    </Link>
  );
}
