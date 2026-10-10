# Native ileri işletme paneli

10 Ekim 2026. Bu liste mevcut web özelliklerinden native uygulamada eksik kalanları ayırır; tamamlananları yeniden yaptırmaz. Ödeme, online depozito ve mağaza hesapları bu çalışma kapsamında değildir.

## Tamamlanan

- [x] **Müşteri adına randevu:** özet, takvim ve randevular ekranından dört adım; mevcut müşteri, şubeye bağlı hizmet/uzman, gün/saat ve onay. Tek müşteri ve tek hizmet; tekrar/grup randevusu değil.
- [x] **Paketler ve seanslar:** operasyon ekranından paket şablonu oluşturma, ad/geçerlilik/aktiflik düzenleme ve müşteriye onaylı tanımlama. Kalan seans/son tarih, arama ve sayfalama. Paket hizmeti/seans adedi değişmez; farklı içerik için yeni şablon gerekir.
- [x] **Canlı veritabanı güvenliği:** iki migration onayla uygulandı. Aktif sahip/yönetici üyeliği, tenant ilişkileri, özel tekrar defteri, anonim RPC yasağı ve paket bakiye RLS kontrol edildi. Eski müşteriler silinmedi, test randevusu/paketi yazılmadı.
- [x] **Regresyon düzeltmeleri:** doğrudan panel bağlantısının doğru Expo HTML'siyle yüklenmesi; Safari testinde görünmeyen alanlara yazma yerine görünür alan/değer doğrulaması; Next.js 16.3.8 güvenlik patch'i.

## Sonraki native özellikler

1. [x] **Bekleme listesi yönetimi — kod ve kontrollü testler:** arama/durum filtresi/25'lik sayfalama, mevcut müşteri adına ekleme, düzenleme, onaylı iptal ve geçerli saatle teklif hazırlama. Saat dilimi/DST, eski grup kaydı, sona erme ve eşzamanlı değişiklik korunur. 028 canlı etkinleştirmesi aşağıdaki kapıda bekler. Teklif SMS/e-posta göndermez, randevu oluşturmaz veya saat ayırmaz.
2. [x] **Kaynak yönetimi — kod ve kontrollü testler:** oda/koltuk/cihaz oluşturma/düzenleme, tek hizmet bağlantısı ve birim ihtiyacı, sayfalı kullanım/gerçek aralık özeti. 029, servis/kaynak kilitlerini sıralar ve randevu ertelemede açık rezervasyonları atomik taşır; değişmiş ihtiyaç grafiğinde eski randevu korunarak işlem durur. Canlı kurulum ve gerçek DB yarış kabulü aşağıda bekler.
3. [ ] **İleri vardiyalar:** tarih aralığı, aynı günde birden fazla çalışma dönemi ve şube ataması. Haftalık vardiya/izin zaten var; ileri planlar şu anda korunuyor, basit editörle ezilmiyor.
4. [ ] **Gerçek rapor özeti/grafikleri:** 7/30/90 gün, önceki dönem, hizmet/uzman/şube kırılımı, doluluk/iptal. Randevu tutarı tahsil edilmiş ödeme olarak sunulmaz; kesilmiş sorgu sonuçlarından yanıltıcı toplam üretilmez.
5. [ ] **Müşteri bakım/sadakat ve iletişim takibi:** müşteri geçmişi, bakım planı, sadakat hareketi ve gönderim durumları; rol/görünürlük ve kişisel veri sınırlarıyla.
6. [ ] **Tam çoklu-işletme kampanyaları:** işletme seçimini transaction'da alan RPC, kod/tutar/tarihlerin atomik düzenlenmesi. Temel kampanya editörü zaten var, ilk yetkili işletme sınırı sürüyor.
7. [ ] **Native onboarding ve görseller:** işletme kaydı, kapak/galeri yükleme, yeni konum/harita üzerinde taşıma. Profil, mevcut adres metni ve haftalık açılış-kapanış editörü zaten var.
8. [ ] **Paket işlem defteri:** tanımlama snapshot'ı, kullanılan seans hareketleri ve atomik tanımlama. Şu an kullanılan sayı tahmin edilmez; aktiflik/geçerlilik eşzamanlı değişiminde tanımlama okunan anın değerlerini kullanabilir.

## Kabul kapıları

- [ ] **028/029 canlı etkinleştirme:** yeni sahip/yönetici RPC'leri ve tablo yazım yetkileri için güncel onay bekleniyor; henüz uygulanmadı. Salt-okunur Supabase ön kontrolünde tenant/aktif yinelenme/servis-şube/rezervasyon zaman uyuşmazlığı sayıları 0, son migration 027, PostgreSQL 17.6. Tutarsız veri ortaya çıkarsa transaction durur; otomatik silme/onarım yoktur.
- [ ] **İzole SQL motor smoke'u:** `supabase/tests/native_resource_engine_smoke.sql` sekiz geçici tablo kontrolü ve ROLLBACK içerir; 029 kurulmadan çalıştırılmaz. Henüz çalıştırılmadı; kontrollü HTTP/static SQL testleri SQL motor kabulü değildir.
- [ ] Ayrı yetkili test hesapları/staging verisiyle canlı randevu yazımı, seans tüketimi ve eşzamanlı kapasite kabulü. Kontrollü testler, gerçek DB yarış/kota testi sayılmaz.
- [ ] Fiziksel iOS/Android klavye, güvenli alan, geri tuşu, düşük ağ ve harita kabulü; EAS/mağaza imzalama ayrı aşamadır.
- [ ] Production HTTPS API, dağıtık rate limiter, yedekleme/geri yükleme, alarm ve ölçülmüş trafik kapasitesi. Bu iki ekranın tamamlanması genel production GO değildir.

Doğrulama kayıtları: [native eşleşme](native-interface-parity.md), [mobil yayın kapısı](mobile-release-checklist.md), [genel üretim TO-DO](../PRODUCTION_READINESS.md).

10 Ekim bu devam turu: 263 birim/yetki testi, bekleme listesi 14/14 ve kaynak 9/9 hedefli mobil E2E geçti; web/mobil TypeScript, lint, güvenlik kapısı, Next.js production build ve Android/iOS Hermes + web export başarılı. Son temiz export üzerinde tam mobil regresyon **104/104** geçti (102 kontrollü + 2 salt-okunur Gogo ana sayfa/harita), retry kullanılmadı. Gerçek müşteri/randevu/kaynak test yazımı yapılmadı.

Kaynak sınırları: oluşturma UUID'si aynı mevcut içerikte tekrar güvenli, fakat değişen metadata/bağlantıda 409 verir; kalıcı replay defteri değildir. Kullanım kaydı bir rezervasyon birimidir, randevu sayısı değildir. Geçmiş rezervasyonlar yeniden doldurulmaz; mevcut/geçmiş zaman uyuşmazlığı kurulumu durdurur. Kaynak fiziksel silme (bağlı işletme/şube silme cascade'i dahil) kapalıdır; aktiflik yönetimi kullanılır. Tek hizmetli desteklenen akışta kilit sırası düzeltildi; çok hizmetli işlemlerde bütün transient deadlock ihtimallerinin kaldırıldığı iddia edilmez.
