import Link from "next/link";
import type { SVGProps } from "react";
import { Dumbbell, Ellipsis, PawPrint, PersonStanding, Scissors } from "lucide-react";
import type { Category } from "@/lib/types";

type CategoryIcon = (props: SVGProps<SVGSVGElement>) => React.ReactNode;

function BarberIcon(props: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M9 3h6v4.2l2 2V19a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V9.2l2-2V3Z" /><path d="M9 7h6M9.5 11.5h5M10 15h4M10.5 18.5h3" /></svg>;
}

function BeautyIcon(props: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M5.2 10.3C5.2 5.8 8 3 12 3s6.8 2.8 6.8 7.3v3.2c0 4.5-2.8 7.5-6.8 7.5s-6.8-3-6.8-7.5v-3.2Z" /><path d="M5.5 10c2.1-.4 3.7-1.8 4.6-4 1.8 2.3 4.5 3.8 8.4 4M9.2 12.2h.1M14.7 12.2h.1M9.7 16c1.5 1 3.1 1 4.6 0" /><path d="M4 8.5 2.8 7.3M20 8.5l1.2-1.2" /></svg>;
}

function NailPolishIcon(props: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M9 3h6v5H9zM8 8h8l1.2 3.2V20a1 1 0 0 1-1 1H7.8a1 1 0 0 1-1-1v-8.8L8 8Z" /><path d="M9.5 12.5v4.8M12 11.5v6.8M14.5 12.5v4.8" /></svg>;
}

function SpaIcon(props: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M8.5 6.5c-1.8-1.8.8-2.8-.5-4.5M13 6.5c-1.8-1.8.8-2.8-.5-4.5" /><path d="M6 11.5c0-1.7 2.7-3 6-3s6 1.3 6 3-2.7 3-6 3-6-1.3-6-3Z" /><path d="M4 17c0-1.6 3.6-2.8 8-2.8s8 1.2 8 2.8-3.6 3-8 3-8-1.4-8-3Z" /></svg>;
}

function PetGroomingIcon(props: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M4 9h8.5a4 4 0 0 1 0 8H9v3H6v-5H4a3 3 0 0 1 0-6Z" /><path d="m15.5 10.5 4-3M16.5 13h5M15.5 15.5l4 3" /><path d="M4 12.2h.1" /></svg>;
}

const presentation: Record<string, { icon: CategoryIcon; background: string; color: string }> = {
  kuafor: { icon: Scissors, background: "#EEE6FF", color: "#7137E8" },
  berber: { icon: BarberIcon, background: "#F2E5FF", color: "#9639DD" },
  guzellik: { icon: BeautyIcon, background: "#FFE4EF", color: "#E83E88" },
  nail: { icon: NailPolishIcon, background: "#EFE5FF", color: "#8338D8" },
  spa: { icon: SpaIcon, background: "#FFEBDD", color: "#DF741B" },
  veteriner: { icon: PawPrint, background: "#DFF7EC", color: "#14A66B" },
  "pet-kuaforu": { icon: PetGroomingIcon, background: "#DFF1FF", color: "#278BD8" },
  fitness: { icon: Dumbbell, background: "#E2F7F1", color: "#159D83" },
  pilates: { icon: PersonStanding, background: "#E7ECFF", color: "#446BE0" },
  diger: { icon: Ellipsis, background: "#F1F1F4", color: "#34343B" },
};

export function CategoryGrid({ categories, compact = false }: { categories: Category[]; compact?: boolean }) {
  return (
    <div className={compact ? "flex gap-2 overflow-x-auto pb-2 hide-scrollbar" : "grid grid-cols-5 gap-x-2 gap-y-3 md:grid-cols-10 md:gap-3"}>
      {categories.map((category) => {
        const item = presentation[category.id] ?? { icon: Ellipsis, background: category.color, color: "#6C4BF4" };
        const Icon = item.icon;
        return (
          <Link key={category.id} href={`/kesfet?category=${category.id}`} className={compact ? "flex shrink-0 items-center gap-2 rounded-xl border border-[#E8E8EE] bg-white px-4 py-2 text-xs font-medium" : "group flex min-w-0 flex-col items-center gap-1.5 text-center text-[10px] font-medium md:gap-2 md:text-xs"}>
            {compact && <span className="grid h-6 w-6 place-items-center rounded-lg" style={{ background: item.background, color: item.color }}><Icon className="h-3.5 w-3.5" strokeWidth={2.25} /></span>}
            {!compact && <span className="grid aspect-square w-full max-w-[58px] place-items-center rounded-[14px] transition duration-200 group-hover:-translate-y-1 group-hover:shadow-[0_8px_18px_rgba(41,30,88,.12)] md:max-w-[72px] md:rounded-2xl" style={{ background: item.background, color: item.color, boxShadow: `inset 0 0 0 1px ${item.color}12` }}><Icon className="h-6 w-6 md:h-7 md:w-7" strokeWidth={2.25} /></span>}
            <span>{category.name}</span>
          </Link>
        );
      })}
    </div>
  );
}
