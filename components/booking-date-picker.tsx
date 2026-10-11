"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type BookingDate = { iso: string; day: string; date: string; full: string };

export function BookingDatePicker({ dates, selected, onSelect }: {
  dates: BookingDate[];
  selected: string;
  onSelect: (date: BookingDate) => void;
}) {
  const list = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ previous: false, next: false });
  const updateEdges = useCallback(() => {
    const node = list.current;
    if (!node) return;
    const previous = node.scrollLeft > 1;
    const next = node.scrollLeft + node.clientWidth < node.scrollWidth - 1;
    setEdges((current) => current.previous === previous && current.next === next ? current : { previous, next });
  }, []);

  useEffect(() => {
    const node = list.current;
    if (!node) return;
    queueMicrotask(updateEdges);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updateEdges);
    observer?.observe(node);
    window.addEventListener("resize", updateEdges);
    return () => { observer?.disconnect(); window.removeEventListener("resize", updateEdges); };
  }, [updateEdges]);

  useEffect(() => {
    const node = list.current;
    const active = node?.querySelector<HTMLButtonElement>('[aria-pressed="true"]');
    if (!node || !active) return;
    const viewport = node.getBoundingClientRect();
    const button = active.getBoundingClientRect();
    // Keep a restored or keyboard-selected date inside this strip, not the page.
    if (button.left < viewport.left) node.scrollBy({ left: button.left - viewport.left });
    else if (button.right > viewport.right) node.scrollBy({ left: button.right - viewport.right });
  }, [selected]);

  function move(direction: -1 | 1) {
    const node = list.current;
    if (node) {
      node.scrollBy({ left: direction * Math.max(72, node.clientWidth - 72), behavior: "auto" });
      updateEdges();
    }
  }

  return (
    <div role="group" aria-label="Randevu tarihi" className="mt-6 min-w-0">
      <p className="mb-3 text-xs text-[#686872]" aria-live="polite">
        {dates.find((date) => date.iso === selected)?.full}
      </p>
      <div className="grid min-w-0 grid-cols-[40px_minmax(0,1fr)_40px] items-center gap-2">
        <button type="button" aria-label="Önceki tarihler" disabled={!edges.previous} onClick={() => move(-1)}
          className="grid h-10 w-10 place-items-center rounded-xl border border-[#E8E8EE] bg-white text-[#5B3BE7] disabled:cursor-default disabled:opacity-35">
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <div ref={list} role="region" aria-label="Tarih listesi" data-testid="booking-date-list" onScroll={updateEdges}
          className="flex min-w-0 gap-2 overflow-x-auto overscroll-x-contain py-1 hide-scrollbar">
          {dates.map((date) => (
            <button key={date.iso} type="button" aria-label={date.full} aria-pressed={selected === date.iso}
              onClick={() => onSelect(date)}
              className={cn("flex w-16 shrink-0 flex-col items-center rounded-xl border px-3 py-3 text-xs",
                selected === date.iso ? "border-[#6C4BF4] bg-[#6C4BF4] text-white" : "border-[#E8E8EE] bg-white hover:border-[#A78BFA]")}
            >
              <span>{date.day}</span><strong className="mt-1 text-base">{date.date}</strong>
            </button>
          ))}
        </div>
        <button type="button" aria-label="Sonraki tarihler" disabled={!edges.next} onClick={() => move(1)}
          className="grid h-10 w-10 place-items-center rounded-xl border border-[#E8E8EE] bg-white text-[#5B3BE7] disabled:cursor-default disabled:opacity-35">
          <ChevronRight className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
