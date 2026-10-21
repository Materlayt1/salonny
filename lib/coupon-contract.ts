import { z } from "zod";
export const couponCode = z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,30}$/);
export const couponSelection = z.object({ businessId: z.uuid(), branchId: z.uuid(), employeeId: z.uuid(), serviceId: z.uuid(), code: couponCode }).strict();
const amount = z.number().int().min(0).max(2_147_483_647);
const totals = z.object({ subtotalMinor: amount, discountMinor: amount.positive(), totalMinor: amount, currency: z.string().regex(/^[A-Z]{3}$/) });
export const couponQuote = totals.extend({ code: couponCode }).refine((result) => result.subtotalMinor - result.discountMinor === result.totalMinor);
export const couponBookingResult = totals.extend({ id: z.uuid(), status: z.enum(["pending", "confirmed", "completed", "cancelled", "no_show"]), couponCode }).refine((result) => result.subtotalMinor - result.discountMinor === result.totalMinor);
export const couponOffer = z.object({ code: couponCode, kind: z.enum(["percentage", "fixed"]), value: z.number().int().positive(), endsAt: z.iso.datetime({ offset: true }).nullable(), audience: z.enum(["all", "new", "loyal", "inactive"]) });
export type CouponOffer = z.infer<typeof couponOffer>;
export type CouponQuote = z.infer<typeof couponQuote>;
export function couponFailure(error: { code?: string; message?: string }): { message: string; status: number; code: string } {
  const markers: Array<[string, string, number]> = [
    ["COUPON_ALREADY_USED", "Bu kuponu daha önce kullandın. Her müşteri aynı kodu yalnız bir kez kullanabilir.", 409],
    ["COUPON_NOT_ELIGIBLE", "Bu kampanyanın müşteri koşulları hesabına uygun değil.", 422],
    ["COUPON_LIMIT", "Bu kuponun toplam kullanım sınırına ulaşıldı.", 409],
    ["COUPON_CHANGED", "Kampanya değişti. Kuponu yeniden uygula.", 409],
    ["COUPON_UNAVAILABLE", "Kupon geçersiz, süresi dolmuş veya seçimine uygulanamıyor.", 422],
    ["BOOKING_KEY_CONFLICT", "Bu işlem anahtarı farklı bir randevu için kullanılmış. Mevcut randevularını kontrol et.", 409],
  ];
  for (const [marker, message, status] of markers) if (error.message?.includes(marker)) return { message, status, code: marker.toLowerCase() };
  return { message: "Kupon altyapısı şu anda kullanılamıyor. İndirim uygulanmış sayılmadı; daha sonra tekrar dene.", status: 503, code: "coupon_unavailable_service" };
}
