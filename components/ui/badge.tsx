import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Badge({ children, tone = "purple", className }: { children: ReactNode; tone?: "purple" | "green" | "amber" | "gray" | "red"; className?: string }) {
  const tones = {
    purple: "bg-[#F0ECFF] text-[#5B3BE7]",
    green: "bg-[#EAFBF0] text-[#15803D]",
    amber: "bg-[#FFF7E6] text-[#A16207]",
    gray: "bg-[#F1F1F4] text-[#52525B]",
    red: "bg-[#FFF0F1] text-[#DC3545]",
  };
  return <span className={cn("inline-flex items-center rounded-lg px-2.5 py-1 text-[11px] font-semibold", tones[tone], className)}>{children}</span>;
}
