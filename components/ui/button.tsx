import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "inverted";

const styles: Record<Variant, string> = {
  primary: "bg-[#6C4BF4] text-white hover:bg-[#5635E6] shadow-[0_8px_24px_rgba(108,75,244,.2)]",
  secondary: "bg-[#F1EDFF] text-[#5635E6] hover:bg-[#E9E2FF]",
  ghost: "bg-white text-[#27272A] border border-[#E8E8EE] hover:border-[#D7D2F6] hover:bg-[#FAF9FF]",
  danger: "bg-[#FFF0F1] text-[#DC3545] hover:bg-[#FFE2E5]",
  inverted: "bg-white text-[#5635E6] hover:bg-[#F1EDFF] shadow-none",
};

export function Button({ className, variant = "primary", children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button className={cn("focus-ring inline-flex h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50", styles[variant], className)} {...props}>{children}</button>;
}

export function ButtonLink({ href, className, variant = "primary", children }: { href: string; className?: string; variant?: Variant; children: ReactNode }) {
  return <Link href={href} className={cn("focus-ring inline-flex h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold transition", styles[variant], className)}>{children}</Link>;
}
