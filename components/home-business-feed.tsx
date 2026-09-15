"use client";

import { useEffect, useRef, useState } from "react";
import { BusinessCard } from "@/components/business-card";
import type { Business } from "@/lib/types";

const PAGE_SIZE = 8;

export function HomeBusinessFeed({ businesses }: { businesses: Business[] }) {
  const [visibleCount, setVisibleCount] = useState(
    Math.min(PAGE_SIZE, businesses.length),
  );
  const loadMoreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target || visibleCount >= businesses.length) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setVisibleCount((current) =>
          Math.min(current + PAGE_SIZE, businesses.length),
        );
      },
      { rootMargin: "500px 0px" },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [businesses.length, visibleCount]);

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-2">
        {businesses.slice(0, visibleCount).map((business, index) => (
          <BusinessCard
            key={business.id}
            business={business}
            feed
            priority={index < 2}
          />
        ))}
      </div>
      {visibleCount < businesses.length && (
        <div
          ref={loadMoreRef}
          aria-label="Daha fazla işletme yükleniyor"
          className="flex items-center justify-center gap-2 py-8 text-xs font-medium text-[#777783]"
        >
          <span className="h-2 w-2 animate-pulse rounded-full bg-[#6C4BF4]" />
          Daha fazla işletme getiriliyor
        </div>
      )}
    </>
  );
}
