# Native ileri işletme paneli

10 Ekim 2026. Bu liste mevcut web özelliklerinden native uygulamada eksik kalanları ayırır; tamamlananları yeniden yaptırmaz. Ödeme, online depozito ve mağaza hesapları bu çalışma kapsamında değildir.

## Tamamlanan

- [x] **Müşteri adına randevu:** özet, takvim ve randevular ekranından dört adım; mevcut müşteri, şubeye bağlı hizmet/uzman, gün/saat ve onay. Tek müşteri ve tek hizmet; tekrar/grup randevusu değil.
- [x] **Paketler ve seanslar:** operasyon ekranından paket şablonu oluşturma, ad/geçerlilik/aktiflik düzenleme ve müşteriye onaylı tanımlama. Kalan seans/son tarih, arama ve sayfalama. Paket hizmeti/seans adedi değişmez; farklı içerik için yeni şablon gerekir.
- [x] **Canlı veritabanı güvenliği:** iki migration onayla uygulandı. Aktif sahip/yönetici üyeliği, tenant ilişkileri, özel tekrar defteri, anonim RPC yasağı ve paket bakiye RLS kontrol edildi. Eski müşteriler silinmedi, test randevusu/paketi yazılmadı.
- [x] **Regresyon düzeltmeleri:** doğrudan panel bağlantısının doğru Expo HTML'siyle yüklenmesi; Safari testinde görünmeyen alanlara yazma yerine görünür alan/değer doğrulaması; Next.js 16.3.8 güvenlik patch'i.

## Sonraki native özellikler

1. [ ] **Bekleme listesi yönetimi:** yalnız kayıt görüntüleme yerine arama/sayfalama, güncelleme, müşteri adına ekleme ve teklif/sona erme durumu. Gerçek iletişim gönderimi ayrıca provider yapılandırması ve kabul testi gerektirir.
2. [ ] **Kaynak yönetimi:** koltuk/oda/cihaz, kapasite, hizmet bağlantısı ve kullanım görünümü. Mevcut çakışma motoruyla atomik doğrulama; çoklu kaynak kilit sırası ayrıca düzenlenmeli.
3. [ ] **İleri vardiyalar:** tarih aralığı, aynı günde birden fazla çalışma dönemi ve şube ataması. Haftalık vardiya/izin zaten var; ileri planlar şu anda korunuyor, basit editörle ezilmiyor.
4. [ ] **Gerçek rapor özeti/grafikleri:** 7/30/90 gün, önceki dönem, hizmet/uzman/şube kırılımı, doluluk/iptal. Randevu tutarı tahsil edilmiş ödeme olarak sunulmaz; kesilmiş sorgu sonuçlarından yanıltıcı toplam üretilmez.
5. [ ] **Müşteri bakım/sadakat ve iletişim takibi:** müşteri geçmişi, bakım planı, sadakat hareketi ve gönderim durumları; rol/görünürlük ve kişisel veri sınırlarıyla.
6. [ ] **Tam çoklu-işletme kampanyaları:** işletme seçimini transaction'da alan RPC, kod/tutar/tarihlerin atomik düzenlenmesi. Temel kampanya editörü zaten var, ilk yetkili işletme sınırı sürüyor.
7. [ ] **Native onboarding ve görseller:** işletme kaydı, kapak/galeri yükleme, yeni konum/harita üzerinde taşıma. Profil, mevcut adres metni ve haftalık açılış-kapanış editörü zaten var.
8. [ ] **Paket işlem defteri:** tanımlama snapshot'ı, kullanılan seans hareketleri ve atomik tanımlama. Şu an kullanılan sayı tahmin edilmez; aktiflik/geçerlilik eşzamanlı değişiminde tanımlama okunan anın değerlerini kullanabilir.

## Kabul kapıları

- [ ] Ayrı yetkili test hesapları/staging verisiyle canlı randevu yazımı, seans tüketimi ve eşzamanlı kapasite kabulü. Kontrollü testler, gerçek DB yarış/kota testi sayılmaz.
- [ ] Fiziksel iOS/Android klavye, güvenli alan, geri tuşu, düşük ağ ve harita kabulü; EAS/mağaza imzalama ayrı aşamadır.
- [ ] Production HTTPS API, dağıtık rate limiter, yedekleme/geri yükleme, alarm ve ölçülmüş trafik kapasitesi. Bu iki ekranın tamamlanması genel production GO değildir.

Doğrulama kayıtları: [native eşleşme](native-interface-parity.md), [mobil yayın kapısı](mobile-release-checklist.md), [genel üretim TO-DO](../PRODUCTION_READINESS.md).
