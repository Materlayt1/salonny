import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { StyleSheet, Text, View } from "react-native";
import { AppButton } from "@/components/app-ui";
import { FormField } from "@/components/form-field";
import { theme } from "@/constants/theme";
import { listCouponOffers, quoteCoupon, type CouponQuote, type CouponSelection } from "@/lib/coupons";
const audience = { all: "Tüm müşteriler", new: "Henüz tamamlanmış randevusu olmayanlar", loyal: "En az 5 tamamlanmış randevusu olanlar", inactive: "Son tamamlanmış randevusu en az 90 gün önce olanlar" };
export function CustomerCouponOffers({ businessId }: { businessId: string }) {
  const query = useQuery({ queryKey: ["public-coupons", businessId], queryFn: () => listCouponOffers(businessId), retry: false, staleTime: 30_000 });
  if (!query.data?.offers.length) return null;
  return <View style={styles.offers}>{query.data.offers.map((offer) => <View key={offer.code} style={styles.card}><Text selectable style={styles.title}>{offer.code} koduyla {offer.kind === "percentage" ? `%${offer.value}` : `${(offer.value / 100).toLocaleString("tr-TR")} TL`} indirim</Text><Text style={styles.note}>{audience[offer.audience]} · Her müşteri yalnız bir kez kullanabilir. Kodu randevunun onay adımında uygula; uygunluk o anda doğrulanır.</Text></View>)}</View>;
}
export function CustomerBookingCoupon({ selection, token, busy: bookingBusy, onChange }: { selection: CouponSelection; token: string; busy: boolean; onChange: (quote: CouponQuote | null, pending: boolean) => void }) {
  const [code, setCode] = useState(""); const [busy, setBusy] = useState(false); const [quote, setQuote] = useState<CouponQuote | null>(null); const [error, setError] = useState(""); const lock = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const apply = async () => {
    if (lock.current || bookingBusy) return; lock.current = true; setBusy(true); setError(""); setQuote(null); onChange(null, true);
    try { const result = await quoteCoupon(selection, code, token); if (alive.current) { setQuote(result); onChange(result, false); } }
    catch (error) { if (alive.current) { setError(error instanceof Error ? error.message : "Kupon doğrulanamadı."); setQuote(null); onChange(null, Boolean(code.trim())); } }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  };
  return <View style={styles.card}><FormField label="Kupon kodu" value={code} onChangeText={(value) => { setCode(value); setQuote(null); setError(""); onChange(null, Boolean(value.trim())); }} placeholder="Örn. HOSGELDIN10" autoCapitalize="characters" autoCorrect={false} maxLength={30} editable={!busy && !bookingBusy} error={error} /><AppButton label={busy ? "Kupon kontrol ediliyor" : "Kuponu uygula"} variant="secondary" busy={busy} disabled={bookingBusy || !code.trim()} onPress={() => void apply()} />{code ? <AppButton label="Kuponu kaldır" variant="ghost" disabled={busy || bookingBusy} onPress={() => { setCode(""); setQuote(null); setError(""); onChange(null, false); }} /> : null}<Text style={styles.note}>Her müşteri aynı kodu yalnız bir kez kullanabilir. Randevu başarıyla oluşturulduğunda tüketilir; iptal kodu yenilemez.</Text>{quote ? <Text accessibilityRole="alert" style={styles.success}>{quote.code} uygulandı · {(quote.discountMinor / 100).toLocaleString("tr-TR")} {quote.currency} indirim. Onayda yeniden kontrol edilir.</Text> : null}</View>;
}
const styles = StyleSheet.create({ offers: { padding: 20, gap: 12 }, card: { borderRadius: 16, padding: 16, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.primarySoft, gap: 12 }, title: { color: theme.colors.primary, fontSize: 14, lineHeight: 21, fontWeight: theme.typography.weight.medium }, note: { color: theme.colors.muted, fontSize: 12, lineHeight: 19 }, success: { color: theme.colors.success, fontSize: 13, lineHeight: 20 } });
