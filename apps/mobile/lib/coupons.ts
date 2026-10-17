import { requestJson } from "@/lib/api";
export type CouponQuote = { code: string; subtotalMinor: number; discountMinor: number; totalMinor: number; currency: string };
export type CouponOffer = { code: string; kind: "percentage" | "fixed"; value: number; endsAt: string | null; audience: "all" | "new" | "loyal" | "inactive" };
export type CouponSelection = { businessId: string; branchId: string; employeeId: string; serviceId: string };
export const listCouponOffers = (businessId: string) => requestJson<{ offers: CouponOffer[] }>(`/api/coupons?businessId=${encodeURIComponent(businessId)}`);
export const quoteCoupon = (selection: CouponSelection, code: string, token: string) => requestJson<CouponQuote>("/api/coupons", { method: "POST", body: JSON.stringify({ ...selection, code }) }, token);
