"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { CouponQuote } from "@/lib/coupon-contract";
export function BookingCoupon({ selection, authenticated, onChange }: { selection: { businessId: string; branchId: string; employeeId: string; serviceId: string }; authenticated: boolean; onChange: (quote: CouponQuote | null, pendingCode: boolean) => void }) {
  const [code, setCode] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false); const [quote, setQuote] = useState<CouponQuote | null>(null);
  const lock = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const apply = async () => {
    if (lock.current) return; lock.current = true; setBusy(true); setError(""); setQuote(null); onChange(null, true);
    try {
      const response = await fetch("/api/coupons", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...selection, code }) });
      const result = await response.json() as CouponQuote & { error?: string };
      if (!alive.current) return;
      if (!response.ok) throw new Error(result.error ?? "Kupon doğrulanamadı.");
      setQuote(result); onChange(result, false);
    } catch (error) { if (alive.current) { setError(error instanceof Error ? error.message : "Kupon doğrulanamadı."); setQuote(null); onChange(null, Boolean(code.trim())); } }
    finally { if (alive.current) setBusy(false); lock.current = false; }
  };
  return <div className="mt-5 rounded-2xl border border-[#E4E0F7] p-4"><label htmlFor="booking-coupon" className="text-sm font-medium">Kupon kodu</label><div className="mt-2 flex min-w-0 flex-wrap gap-2"><input id="booking-coupon" value={code} disabled={busy} maxLength={30} autoCapitalize="characters" autoComplete="off" onChange={(event) => { setCode(event.target.value); setQuote(null); setError(""); onChange(null, Boolean(event.target.value.trim())); }} placeholder="Örn. HOSGELDIN10" className="h-11 min-w-0 flex-1 rounded-xl border border-[#E3E3E9] px-3 text-sm" /><Button variant="secondary" disabled={busy || !authenticated || !code.trim()} onClick={apply}>{busy ? "Kontrol ediliyor" : "Uygula"}</Button>{code && <Button variant="ghost" disabled={busy} onClick={() => { setCode(""); setQuote(null); setError(""); onChange(null, false); }}>Kaldır</Button>}</div><p className="mt-2 text-xs leading-5 text-[#686872]">Her müşteri aynı kodu yalnız bir kez kullanabilir. Başarılı randevu oluşturulduğunda kullanım hakkı tüketilir; iptal kodu yenilemez.{!authenticated ? " Uygulamak için önce giriş yap." : ""}</p>{error && <p role="alert" className="mt-2 text-sm text-[#B42332]">{error}</p>}{quote && <p role="status" className="mt-2 text-sm text-[#167D45]">{quote.code} uygulandı · {(quote.discountMinor / 100).toLocaleString("tr-TR")} {quote.currency} indirim. Randevu onayında yeniden doğrulanır.</p>}</div>;
}
