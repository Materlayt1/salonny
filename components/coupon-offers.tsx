"use client";
import { useEffect, useState } from "react";
import type { CouponOffer } from "@/lib/coupon-contract";
const audience: Record<CouponOffer["audience"], string> = { all: "Tüm müşteriler", new: "Henüz tamamlanmış randevusu olmayan müşteriler", loyal: "En az 5 tamamlanmış randevusu olan müşteriler", inactive: "Son tamamlanmış randevusu en az 90 gün önce olan müşteriler" };
export function CouponOffers({ businessId }: { businessId: string }) {
  const [offers, setOffers] = useState<CouponOffer[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/coupons?businessId=${encodeURIComponent(businessId)}`, { signal: controller.signal }).then(async (response) => {
      if (!response.ok) return;
      const result = await response.json() as { offers: CouponOffer[] };
      if (!controller.signal.aborted) setOffers(result.offers);
    }).catch(() => undefined);
    return () => controller.abort();
  }, [businessId]);
  if (!offers.length) return null;
  return <section aria-label="İşletme kuponları" className="my-6 grid min-w-0 gap-3">{offers.map((offer) => <div key={offer.code} className="rounded-2xl border border-[#DED8FA] bg-[#FAF9FF] p-4"><p className="text-sm font-semibold text-[#5B3BE7]"><code className="select-all break-all">{offer.code}</code> koduyla {offer.kind === "percentage" ? `%${offer.value}` : `${(offer.value / 100).toLocaleString("tr-TR")} TL`} indirim</p><p className="mt-2 text-xs leading-5 text-[#686872]">{audience[offer.audience]} · Her müşteri yalnız bir kez kullanabilir. Kodu randevunun onay adımında uygula.{offer.endsAt ? ` Son gün: ${new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", dateStyle: "medium" }).format(new Date(offer.endsAt))}.` : ""} Uygunluk ve güncel tutar onayda kontrol edilir.</p></div>)}</section>;
}
