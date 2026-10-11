# Native ileri işletme paneli

11 Ekim 2026. Bu liste mevcut web özelliklerinden native uygulamada eksik kalanları ayırır; tamamlananları yeniden yaptırmaz. Ödeme, online depozito ve mağaza hesapları bu çalışma kapsamında değildir.

## Tamamlanan

- [x] **Müşteri adına randevu:** özet, takvim ve randevular ekranından dört adım; mevcut müşteri, şubeye bağlı hizmet/uzman, gün/saat ve onay. Tek müşteri ve tek hizmet; tekrar/grup randevusu değil.
- [x] **Paketler ve seanslar:** operasyon ekranından paket şablonu oluşturma, ad/geçerlilik/aktiflik düzenleme ve müşteriye onaylı tanımlama. Kalan seans/son tarih, arama ve sayfalama. Paket hizmeti/seans adedi değişmez; farklı içerik için yeni şablon gerekir.
- [x] **Canlı veritabanı güvenliği:** iki migration onayla uygulandı. Aktif sahip/yönetici üyeliği, tenant ilişkileri, özel tekrar defteri, anonim RPC yasağı ve paket bakiye RLS kontrol edildi. Eski müşteriler silinmedi, test randevusu/paketi yazılmadı.
- [x] **Regresyon düzeltmeleri:** doğrudan panel bağlantısının doğru Expo HTML'siyle yüklenmesi; Safari testinde görünmeyen alanlara yazma yerine görünür alan/değer doğrulaması; Next.js 16.3.8 güvenlik patch'i.

## Sonraki native özellikler

1. [x] **Bekleme listesi yönetimi:** arama/durum filtresi/25'lik sayfalama, mevcut müşteri adına ekleme, düzenleme, onaylı iptal ve geçerli saatle teklif hazırlama. Saat dilimi/DST, eski grup kaydı, sona erme ve eşzamanlı değişiklik korunur. 028 canlıda onayla kuruldu. Teklif SMS/e-posta göndermez, randevu oluşturmaz veya saat ayırmaz.
2. [x] **Kaynak yönetimi:** oda/koltuk/cihaz oluşturma/düzenleme, tek hizmet bağlantısı ve birim ihtiyacı, sayfalı kullanım/gerçek aralık özeti. Canlı 029, servis/kaynak kilitlerini sıralar ve randevu ertelemede açık rezervasyonları atomik taşır; değişmiş ihtiyaç grafiğinde eski randevu korunarak işlem durur. 030 kalan varsayılan tablo/kolon haklarını kapattı. Gerçek DB yarış kabulü aşağıda bekler.
3. [ ] **İleri vardiyalar:** tarih aralığı, aynı günde birden fazla çalışma dönemi ve şube ataması. Haftalık vardiya/izin zaten var; ileri planlar şu anda korunuyor, basit editörle ezilmiyor.
4. [ ] **Gerçek rapor özeti/grafikleri:** 7/30/90 gün, önceki dönem, hizmet/uzman/şube kırılımı, doluluk/iptal. Randevu tutarı tahsil edilmiş ödeme olarak sunulmaz; kesilmiş sorgu sonuçlarından yanıltıcı toplam üretilmez.
5. [ ] **Müşteri bakım/sadakat ve iletişim takibi:** müşteri geçmişi, bakım planı, sadakat hareketi ve gönderim durumları; rol/görünürlük ve kişisel veri sınırlarıyla.
6. [ ] **Tam çoklu-işletme kampanyaları:** işletme seçimini transaction'da alan RPC, kod/tutar/tarihlerin atomik düzenlenmesi. Temel kampanya editörü zaten var, ilk yetkili işletme sınırı sürüyor.
7. [ ] **Native onboarding ve görseller:** işletme kaydı, kapak/galeri yükleme, yeni konum/harita üzerinde taşıma. Profil, mevcut adres metni ve haftalık açılış-kapanış editörü zaten var.
8. [ ] **Paket işlem defteri:** tanımlama snapshot'ı, kullanılan seans hareketleri ve atomik tanımlama. Şu an kullanılan sayı tahmin edilmez; aktiflik/geçerlilik eşzamanlı değişiminde tanımlama okunan anın değerlerini kullanabilir.

## Kabul kapıları

- [x] **028/029 canlı etkinleştirme:** 11 Ekim'de açık onayla kuruldu ve geçmişe işlendi. Ek 030 düzeltmesi varsayılan TRUNCATE/REFERENCES/TRIGGER/MAINTAIN ve kolon haklarını kapattı; RLS/işlevler/veriler değişmedi. Salt-okunur kurulum denetimi 12/12, fonksiyon gövdeleri repo eşleşmesi 11/11; dokuz tenant FK doğrulandı. Tutarsız veride işlem durur; otomatik silme/onarım yoktur.
- [x] **İzole SQL motor smoke'u:** `supabase/tests/native_resource_engine_smoke.sql` canlı PostgreSQL 17.6'da sekiz geçici tablo kontrolünden geçti; tüm test nesneleri ROLLBACK ile geri alındı. Aynı/ardışık zaman, gerçek tepe, atomik taşıma, kapasite/aktiflik/graph/scope hatasında rollback ve tekrarlanan hizmet birim toplamı doğrulandı. Bu seri motor testidir, gerçek JWT/RLS/eşzamanlı trafik kabulü değildir.
- [ ] Ayrı yetkili test hesapları/staging verisiyle canlı randevu yazımı, seans tüketimi ve eşzamanlı kapasite kabulü. Kontrollü testler, gerçek DB yarış/kota testi sayılmaz.
- [ ] Fiziksel iOS/Android klavye, güvenli alan, geri tuşu, düşük ağ ve harita kabulü; EAS/mağaza imzalama ayrı aşamadır.
- [ ] Production HTTPS API, dağıtık rate limiter, yedekleme/geri yükleme, alarm ve ölçülmüş trafik kapasitesi. Bu iki ekranın tamamlanması genel production GO değildir.

Doğrulama kayıtları: [native eşleşme](native-interface-parity.md), [mobil yayın kapısı](mobile-release-checklist.md), [genel üretim TO-DO](../PRODUCTION_READINESS.md).

10 Ekim bu devam turu: 263 birim/yetki testi, bekleme listesi 14/14 ve kaynak 9/9 hedefli mobil E2E geçti; web/mobil TypeScript, lint, güvenlik kapısı, Next.js production build ve Android/iOS Hermes + web export başarılı. Son temiz export üzerinde tam mobil regresyon **104/104** geçti (102 kontrollü + 2 salt-okunur Gogo ana sayfa/harita), retry kullanılmadı. Gerçek müşteri/randevu/kaynak test yazımı yapılmadı.

11 Ekim canlı kurulum: 267/267 birim testi, 8/8 izole SQL motor ve 12/12 metadata/yetki kontrolü geçti. İki RPC ve iki korumalı tablo için anonim doğrudan Supabase çağrıları 401; iki yeni API için oturumsuz erişim 401. Public dizin iki gerçek işletmeyle 200 vermeye devam etti. Yerel readiness 200, DB ok; Redis yalnız development'ta optional, production kapısı geçilmiş sayılmaz. Yeni native kaynak kodu değişmediği için 104 mobil E2E'nin 10 Ekim kaydı korunur, bu turda yeniden koşulmadı.

Kaynak sınırları: oluşturma UUID'si aynı mevcut içerikte tekrar güvenli, fakat değişen metadata/bağlantıda 409 verir; kalıcı replay defteri değildir. Kullanım kaydı bir rezervasyon birimidir, randevu sayısı değildir. Geçmiş rezervasyonlar yeniden doldurulmaz; mevcut/geçmiş zaman uyuşmazlığı kurulumu durdurur. Kaynak fiziksel silme (bağlı işletme/şube silme cascade'i dahil) kapalıdır; aktiflik yönetimi kullanılır. Tek hizmetli desteklenen akışta kilit sırası düzeltildi; çok hizmetli işlemlerde bütün transient deadlock ihtimallerinin kaldırıldığı iddia edilmez.
