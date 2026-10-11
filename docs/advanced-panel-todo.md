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
3. [x] **İleri vardiyalar — kod/test ve canlı 031 kuruldu:** tarih aralığı, aynı günde birden fazla çalışma dönemi, şube ataması ve pasif şube planı temizliği native ekrana eklendi. Web/native basit haftalık toplu değiştirmeye transaction içinde ileri plan koruması eklendi. Tarihli dönemler mevcut müsaitlik motorunda ek dönemdir; haftalık planın yerine geçmez. 031 açık onayla canlı kuruldu; 12/12 kurulum/ACL denetimi geçti. Gerçek JWT/RLS/yazım/yarış kabulü aşağıdaki ayrı kapıda bekler.
4. [ ] **Gerçek rapor özeti/grafikleri:** 7/30/90 gün, önceki dönem, hizmet/uzman/şube kırılımı, doluluk/iptal. Randevu tutarı tahsil edilmiş ödeme olarak sunulmaz; kesilmiş sorgu sonuçlarından yanıltıcı toplam üretilmez.
5. [ ] **Müşteri bakım/sadakat ve iletişim takibi:** müşteri geçmişi, bakım planı, sadakat hareketi ve gönderim durumları; rol/görünürlük ve kişisel veri sınırlarıyla.
6. [ ] **Tam çoklu-işletme kampanyaları:** işletme seçimini transaction'da alan RPC, kod/tutar/tarihlerin atomik düzenlenmesi. Temel kampanya editörü zaten var, ilk yetkili işletme sınırı sürüyor.
7. [ ] **Native onboarding ve görseller:** işletme kaydı, kapak/galeri yükleme, yeni konum/harita üzerinde taşıma. Profil, mevcut adres metni ve haftalık açılış-kapanış editörü zaten var.
8. [ ] **Paket işlem defteri:** tanımlama snapshot'ı, kullanılan seans hareketleri ve atomik tanımlama. Şu an kullanılan sayı tahmin edilmez; aktiflik/geçerlilik eşzamanlı değişiminde tanımlama okunan anın değerlerini kullanabilir.

## Kabul kapıları

- [x] **028/029 canlı etkinleştirme:** 11 Ekim'de açık onayla kuruldu ve geçmişe işlendi. Ek 030 düzeltmesi varsayılan TRUNCATE/REFERENCES/TRIGGER/MAINTAIN ve kolon haklarını kapattı; RLS/işlevler/veriler değişmedi. Salt-okunur kurulum denetimi 12/12, fonksiyon gövdeleri repo eşleşmesi 11/11; dokuz tenant FK doğrulandı. Tutarsız veride işlem durur; otomatik silme/onarım yoktur.
- [x] **031/032 canlı etkinleştirme:** 11 Ekim'de iki güncelleme açık onayla kuruldu. Vardiya/kupon kurulum ve yetki denetimleri 20/20; 12 fonksiyon gövdesi ve iki tam migration-geçmişi kaynağı 14/14 eşleşti. Sekiz mevcut tablonun kayıt sayıları değişmedi; test randevusu, kupon kullanımı, SMS veya ödeme oluşturulmadı. Web/native ortak müşteri kuponu, sunucuda fiyat doğrulama ve müşteri/kod başına atomik tek kullanım defteri etkin.
- [x] **Gerçek kupon duyurusu/quote kabulü:** mevcut %10 kampanya localhost ve yetkili Vercel tarayıcısında göründü. Mevcut localhost hesabıyla yalnız quote, ₺400 hizmeti ₺40 indirim/₺360 toplam olarak doğruladı; randevu gönderilmedi. Public uçlar 200, oturumsuz/anonim korumalı API/RPC/tablo çağrıları 401. [Kabul ve sınırlar](staff-coupons-deployment-acceptance.md).
- [x] **İzole SQL motor smoke'u:** `supabase/tests/native_resource_engine_smoke.sql` canlı PostgreSQL 17.6'da sekiz geçici tablo kontrolünden geçti; tüm test nesneleri ROLLBACK ile geri alındı. Aynı/ardışık zaman, gerçek tepe, atomik taşıma, kapasite/aktiflik/graph/scope hatasında rollback ve tekrarlanan hizmet birim toplamı doğrulandı. Bu seri motor testidir, gerçek JWT/RLS/eşzamanlı trafik kabulü değildir.
- [ ] Ayrı yetkili test hesapları/staging verisiyle canlı randevu yazımı, seans tüketimi ve eşzamanlı kapasite kabulü. Kontrollü testler, gerçek DB yarış/kota testi sayılmaz.
- [ ] Fiziksel iOS/Android klavye, güvenli alan, geri tuşu, düşük ağ ve harita kabulü; EAS/mağaza imzalama ayrı aşamadır.
- [ ] Production HTTPS API, dağıtık rate limiter, yedekleme/geri yükleme, alarm ve ölçülmüş trafik kapasitesi. Bu iki ekranın tamamlanması genel production GO değildir.

Doğrulama kayıtları: [native eşleşme](native-interface-parity.md), [mobil yayın kapısı](mobile-release-checklist.md), [genel üretim TO-DO](../PRODUCTION_READINESS.md).

11 Ekim son kod kapısı: **484/484** birim/yetki testi, 031 izole fixture **29/29**, 032 kupon fixture **32/32**, son temiz preview export'ta tam mobil **125/125** (123 kontrollü + 2 salt-okunur Gogo) geçti; retry yok. Web/mobil tip, lint, güvenlik kapısı, Next.js production build ve güncel Android/iOS Hermes + web export başarılı. İleri vardiya 16, müşteri kuponu 5 kontrollü native senaryo içerir. Ardından 031/032 canlı kurulum ve salt-okunur kabul tamamlandı; native kaynak değişmediğinden bu mobil koşu yeniden yapılmış sayılmaz. Sıradaki iş #4 gerçek rapor özetidir.

10 Ekim bu devam turu: 263 birim/yetki testi, bekleme listesi 14/14 ve kaynak 9/9 hedefli mobil E2E geçti; web/mobil TypeScript, lint, güvenlik kapısı, Next.js production build ve Android/iOS Hermes + web export başarılı. Son temiz export üzerinde tam mobil regresyon **104/104** geçti (102 kontrollü + 2 salt-okunur Gogo ana sayfa/harita), retry kullanılmadı. Gerçek müşteri/randevu/kaynak test yazımı yapılmadı.

11 Ekim canlı kurulum: 267/267 birim testi, 8/8 izole SQL motor ve 12/12 metadata/yetki kontrolü geçti. İki RPC ve iki korumalı tablo için anonim doğrudan Supabase çağrıları 401; iki yeni API için oturumsuz erişim 401. Public dizin iki gerçek işletmeyle 200 vermeye devam etti. Yerel readiness 200, DB ok; Redis yalnız development'ta optional, production kapısı geçilmiş sayılmaz. Yeni native kaynak kodu değişmediği için 104 mobil E2E'nin 10 Ekim kaydı korunur, bu turda yeniden koşulmadı.

Kaynak sınırları: oluşturma UUID'si aynı mevcut içerikte tekrar güvenli, fakat değişen metadata/bağlantıda 409 verir; kalıcı replay defteri değildir. Kullanım kaydı bir rezervasyon birimidir, randevu sayısı değildir. Geçmiş rezervasyonlar yeniden doldurulmaz; mevcut/geçmiş zaman uyuşmazlığı kurulumu durdurur. Kaynak fiziksel silme (bağlı işletme/şube silme cascade'i dahil) kapalıdır; aktiflik yönetimi kullanılır. Tek hizmetli desteklenen akışta kilit sırası düzeltildi; çok hizmetli işlemlerde bütün transient deadlock ihtimallerinin kaldırıldığı iddia edilmez.
