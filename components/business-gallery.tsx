"use client";

import Image from "next/image";
import { ChevronLeft, ChevronRight, Images, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

export function BusinessGalleryLauncher({
  images,
  businessName,
  initialIndex = 0,
  className,
  imageClassName,
  showCount = true,
  priority = false,
  sizes = "100vw",
}: {
  images: string[];
  businessName: string;
  initialIndex?: number;
  className?: string;
  imageClassName?: string;
  showCount?: boolean;
  priority?: boolean;
  sizes?: string;
}) {
  const safeImages = images.length ? images : ["/brand/salonny-mark.png"];
  const startIndex = Math.min(Math.max(initialIndex, 0), safeImages.length - 1);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(startIndex);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
      if (event.key === "ArrowLeft") setSelected((value) => (value - 1 + safeImages.length) % safeImages.length);
      if (event.key === "ArrowRight") setSelected((value) => (value + 1) % safeImages.length);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", onKeyDown); };
  }, [open, safeImages.length]);

  const modal = open && typeof document !== "undefined" ? createPortal(
    <div role="dialog" aria-modal="true" aria-label={`${businessName} fotoğraf galerisi`} className="fixed inset-0 z-[120] flex flex-col bg-[#0D0D12]/96 text-white" onClick={() => setOpen(false)}>
      <div className="flex h-16 shrink-0 items-center justify-between px-4 md:px-7">
        <div><strong className="block text-sm">{businessName}</strong><span className="text-xs text-white/60">{selected + 1} / {safeImages.length}</span></div>
        <button type="button" onClick={() => setOpen(false)} aria-label="Galeriyi kapat" className="grid h-11 w-11 place-items-center rounded-full bg-white/10 transition hover:bg-white/20"><X className="h-5 w-5" /></button>
      </div>
      <div className="relative min-h-0 flex-1" onClick={(event) => event.stopPropagation()}>
        <div className="absolute inset-4 md:inset-8"><Image src={safeImages[selected]} alt={`${businessName} fotoğraf ${selected + 1}`} fill priority className="object-contain" sizes="100vw" /></div>
        {safeImages.length > 1 && <><button type="button" onClick={() => setSelected((value) => (value - 1 + safeImages.length) % safeImages.length)} aria-label="Önceki fotoğraf" className="absolute left-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/12 backdrop-blur transition hover:bg-white/25 md:left-7"><ChevronLeft className="h-6 w-6" /></button><button type="button" onClick={() => setSelected((value) => (value + 1) % safeImages.length)} aria-label="Sonraki fotoğraf" className="absolute right-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/12 backdrop-blur transition hover:bg-white/25 md:right-7"><ChevronRight className="h-6 w-6" /></button></>}
      </div>
      {safeImages.length > 1 && <div className="flex h-24 shrink-0 gap-2 overflow-x-auto px-4 py-3 md:justify-center md:px-7 hide-scrollbar" onClick={(event) => event.stopPropagation()}>{safeImages.map((image, index) => <button type="button" key={`${image}-${index}`} onClick={() => setSelected(index)} aria-label={`${index + 1}. fotoğrafı göster`} className={cn("relative h-16 w-20 shrink-0 overflow-hidden rounded-lg border-2 transition", selected === index ? "border-[#8D70FF] opacity-100" : "border-transparent opacity-55 hover:opacity-90")}><Image src={image} alt="" fill className="object-cover" sizes="80px" /></button>)}</div>}
    </div>,
    document.body,
  ) : null;

  return <>
    <button type="button" onClick={() => { setSelected(startIndex); setOpen(true); }} aria-label={`${businessName} fotoğraflarını aç`} className={cn("group relative block overflow-hidden text-left", className)}>
      <Image src={safeImages[startIndex]} alt={`${businessName} fotoğraf ${startIndex + 1}`} fill priority={priority} className={cn("object-cover transition duration-500 group-hover:scale-[1.02]", imageClassName)} sizes={sizes} />
      {showCount && <span className="absolute bottom-4 right-4 inline-flex items-center gap-1.5 rounded-lg bg-black/70 px-3 py-2 text-[11px] font-semibold text-white backdrop-blur"><Images className="h-3.5 w-3.5" /> Tüm fotoğraflar ({safeImages.length})</span>}
    </button>
    {modal}
  </>;
}
