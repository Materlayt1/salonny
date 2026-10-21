"use client";

import Link from "next/link";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="tr">
      <body>
        <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, fontFamily: "system-ui, sans-serif", background: "#f7f7fa", color: "#15151a" }}>
          <section style={{ width: "min(100%, 520px)", padding: 32, border: "1px solid #e8e8ee", borderRadius: 24, background: "white", textAlign: "center" }}>
            <p style={{ margin: 0, color: "#6c4bf4", fontWeight: 700 }}>Salonny</p>
            <h1 style={{ margin: "16px 0 0", fontSize: 28 }}>Beklenmeyen bir sorun oluştu</h1>
            <p style={{ margin: "12px 0 0", color: "#666672", lineHeight: 1.6 }}>Bilgilerin güvende. Sayfayı yeniden deneyebilir veya ana sayfaya dönebilirsin.</p>
            <div style={{ display: "flex", justifyContent: "center", gap: 12, marginTop: 24, flexWrap: "wrap" }}>
              <button type="button" onClick={reset} style={{ minHeight: 44, border: 0, borderRadius: 12, padding: "0 20px", background: "#6c4bf4", color: "white", fontWeight: 700 }}>Tekrar dene</button>
              <Link href="/" style={{ display: "inline-flex", minHeight: 44, alignItems: "center", border: "1px solid #e8e8ee", borderRadius: 12, padding: "0 20px", color: "#15151a", fontWeight: 700 }}>Ana sayfa</Link>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}
