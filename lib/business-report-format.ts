const canonicalMinor = (value: string) => /^(0|[1-9]\d{0,29})$/.test(value);
export function formatReportMoney(minor: string, currency: string) {
  if (!canonicalMinor(minor) || !/^[A-Z]{3}$/.test(currency)) throw new RangeError("Geçersiz rapor tutarı.");
  const amount = BigInt(minor);
  return `${(amount / BigInt(100)).toLocaleString("tr-TR")},${(amount % BigInt(100)).toString().padStart(2, "0")} ${currency}`;
}
export function reportPercentChange(current: number, previous: number) {
  return previous === 0 ? "Önceki dönem sıfır; yüzde değişim hesaplanamaz." : `${current >= previous ? "+" : ""}${((current - previous) / previous * 100).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}% önceki döneme göre`;
}
export function reportValueChange(current: string, previous: string) {
  if (!canonicalMinor(current) || !canonicalMinor(previous)) throw new RangeError("Geçersiz rapor tutarı.");
  const base = BigInt(previous); if (base === BigInt(0)) return "Önceki dönem sıfır; yüzde değişim hesaplanamaz.";
  const change = (BigInt(current) - base) * BigInt(10_000) / base;
  const absolute = change < BigInt(0) ? -change : change;
  return `${change < BigInt(0) ? "−" : "+"}${(absolute / BigInt(100)).toLocaleString("tr-TR")},${(absolute % BigInt(100)).toString().padStart(2, "0")}% önceki döneme göre`;
}
export const reportRate = (part: number, total: number) => total ? `${(part / total * 100).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}%` : "Hesaplanamaz";
export const reportDate = (date: string) => new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
