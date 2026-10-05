# Salonny üretim hazırlığı ve ürün TO-DO listesi

Son güncelleme: 5 Ekim 2026. Ödeme ve online depozito bu çalışmanın kapsamı dışındadır.

## Tamamlanan P0 işleri

- [x] Next.js ve MapLibre kritik güvenlik güncellemeleri uygulandı; yeni bağımlılık advisory'leri için aşağıdaki doğrulanmış yerel yama kapısı eklendi.
- [x] CSP, HSTS, frame, MIME, referrer, tarayıcı izinleri ve statik varlık cache başlıkları sertleştirildi.
- [x] IP adresini düz metin saklamayan ortak API oran sınırlama katmanı eklendi.
- [x] Rezervasyon, randevu değişikliği, yorum, bildirim, cache yenileme, admin ve işletme mutasyonları üretimde dağıtık rate limiter yoksa güvenli biçimde kapanacak şekilde ayarlandı.
- [x] Auth servisinin yapılandırılmadığı durumda sahte başarılı giriş/kayıt yönlendirmesi kaldırıldı.
- [x] Marketplace liste sorgusundan gereksiz çalışan verisi çıkarıldı; yorum ilişkisi işletme başına üç kayıtla sınırlandı, detay sorgusunda son 50 yorum sınırı eklendi.
- [x] Public veri isteklerine iki saniyelik üst sınır ve kontrollü boş durum eklendi.
- [x] Public sorgulara süreç içi single-flight/cache katmanı eklendi; bağımlılık kesintisinde eşzamanlı ilk istek yığılması sınırlandı.
- [x] Keşfet sayfası ilk veriyi sunucuda hazırlayacak biçimde ayrıldı; ilk tarayıcı API turu kaldırıldı.
- [x] Üst menü oturumu ve favoriler sunucu taraflı özet API'sinde birleştirildi; kart başına oturum/favori sorgusu ve ana sayfadaki Supabase tarayıcı SDK'sı kaldırıldı.
- [x] Favori ekleme/çıkarma, kimliği sunucuda doğrulayan ve oran sınırlanan API'ye taşındı.
- [x] Veritabanına marketplace, çalışan uygunluğu, tenant bağlamı ve okunmamış bildirim yolları için üretim indeksleri eklendi.
- [x] `/api/health/live` ve `/api/health/ready` canlılık/hazırlık uçları eklendi.
- [x] Sunucu hata gözlemlenebilirliği ve örneklemeli gerçek kullanıcı Core Web Vitals telemetrisi eklendi.
- [x] Kök hata ekranı, klavye odak stilleri, ana içeriğe geç bağlantısı ve azaltılmış hareket desteği eklendi.
- [x] Arayüz renk kontrastları WCAG denetiminde tam puan verecek şekilde düzeltildi.
- [x] Salt-okunur, ayarlanabilir eşzamanlı yük testi (`pnpm test:load`) eklendi.
- [x] Tip kontrolü, lint, birim testleri, E2E, üretim build'i ve bağımlılık denetimi kalite kapısı olarak tanımlandı.
- [x] Tekrarlanabilir container dağıtımı için çok aşamalı, root olmayan standalone Docker imajı ve canlılık kontrolü eklendi.
- [x] GitHub Actions üzerinde bağımlılık, lint, tip, birim test ve üretim build kalite kapısı eklendi.
- [x] Üretim sırları, HTTPS, Supabase, Redis ve readiness uçlarını doğrulayan `pnpm test:production-readiness` kapısı eklendi.
- [x] Trigger-only `SECURITY DEFINER` fonksiyonlarının doğrudan API çalıştırma yetkileri kapatıldı; Supabase Security Advisor 0 hata verdi.
- [x] Çakışan SELECT/ALL RLS politikaları ayrıştırıldı ve yinelenen yorum indeksi kaldırıldı; Supabase Performance Advisor 0 hata/0 uyarı verdi.
- [x] Expo/React Native iOS ve Android müşteri uygulaması; ortak tip sözleşmeleri, SecureStore oturumu, Bearer API yetkilendirmesi, keşfet/detay/rezervasyon/favori/randevu/profil akışlarıyla eklendi.
- [x] Mobil uygulama için EAS build profilleri, mağaza kimlikleri, uygulama içi hesap silme talebi, CORS allowlist'i ve ayrı CI typecheck/export kapısı eklendi.

## Canlıya çıkmadan önce tamamlanması gereken P0 operasyon işleri

- [x] `202608180022_customer_waitlist.sql` dahil tüm Supabase migrasyonlarını production'a uygula ve salt-okunur güvenlik sorgusuyla doğrula.
- [ ] Ayrı bir staging Supabase projesi açıldığında aynı migrasyonları staging'e uygula.
- [ ] Production ortamında Upstash Redis değişkenlerini tanımla; readiness ucu `200 ready` vermeden trafik açma.
- [ ] Supabase bağlantı havuzu, PITR/yedekleme, geri yükleme tatbikatı ve kota alarmlarını etkinleştir.
- [x] Sunucu hataları ve Core Web Vitals için JSON log-drain aktarımını kodla; kalıcı hedef ve alarm eşiklerini runbook'ta tanımla.
- [ ] Production log-drain hesabını bağla ve tanımlı alarmları etkinleştir.
- [ ] Gerçek CDN, production alan adı ve temsili görsellerle Lighthouse/alan verisini tekrar ölç; p75 hedeflerini LCP ≤ 2,5 sn, INP ≤ 200 ms ve CLS ≤ 0,1 olarak alarm koşullarına bağla.
- [ ] CDN/WAF üzerinde bot, DDoS ve ülke bazlı anomali kuralları kur; health uçlarını load balancer'a bağla.
- [ ] Gerçekçi anonimleştirilmiş staging verisiyle k6/Artillery üzerinde kademeli 1k, 10k ve hedef eşzamanlılık testleri yap. “Milyon trafik” garantisi ancak bu test, kota ve altyapı ölçümleriyle verilebilir.
- [ ] Supabase RLS ve `SECURITY DEFINER` fonksiyonları için ayrı bir penetrasyon testi çalıştır.
- [ ] Mobil uygulamayı fiziksel iPhone/Android cihazlarda ve TestFlight/Play Internal Testing kanallarında kabul testinden geçir; mağaza hesapları, imzalama ve hukuki formlar tamamlanmadan public rollout açma.
- [x] Gizli anahtar rotasyonu, olay müdahale planı, SLO, kapasite/yük testi ve geri yükleme runbook'unu yazılı hale getir.

## Son yerel doğrulama sonuçları

5 Ekim mobil düzeltmeleri: giriş public ayarlarının API'den yüklenmesi, ortak kimlik geçidi, boşta kalan form hata yönetimi, mobil CORS ve kaynak doğrulaması düzeltildi. Randevu iptal/değişiklik, yorum, kişisel bilgi ve bildirim ekranları eklendi. İşletme listeleri sanallaştırıldı, arama istekleri geciktirildi, favori kartları tek toplu sorguya taşındı. 32 birim/güvenlik testi ve 8 kontrollü mobil E2E senaryosu geçti.

Ham bağımlılık taraması yeni `node-forge` ve `braces` advisory kayıtlarını sürüm numaralarından dolayı göstermeye devam ediyor; yayımlanmış upstream düzeltme yok. Her iki paket dar kapsamlı yerel yamalarla korunuyor; `pnpm test:security` kurulu paketlere bozuk imza/derin desen regresyonlarını uyguluyor ve bunların dışındaki tüm advisory'lerde kapanıyor. [Yama notları](docs/dependency-security-patches.md) bu geçici yaklaşımın kapsamını kaydediyor.

5 Ekim son kapısı:

- Next.js üretim derlemesi, web/mobil TypeScript ve ESLint başarılı; 32/32 birim testi ve 8/8 kontrollü mobil E2E testi geçti.
- Üretim web E2E: 18 geçti, 10 platform/veri koşullu senaryo atlandı. Canlı hesapla doğru parola, e-posta teslimatı veya gerçek rezervasyon oluşturma bu testlerin kapsamı değildir.
- Expo Doctor 21/21; Android/iOS Hermes paketleri ve web static export başarılı. Fiziksel cihaz kabul testinin yerine geçmez.
- Yerel üretim yük smoke'u: 1.000 salt-okunur istek, 50 eşzamanlı bağlantı; 0 hata, 254,5 istek/sn; p95 376 ms, p99 463 ms.
- Isınmış tarayıcı smoke'u: masaüstü ana sayfa/keşfet DCL 247/105 ms, LCP 268/160 ms; mobil DCL 244/120 ms, LCP 252/456 ms; sayfa hatası yok. Ağ/CPU yavaşlatması uygulanmadı; saha Core Web Vitals ölçümü değildir.
- Canlı public dizin iki gerçek Gogo işletmesini döndürdü; Auth sağlık geçidi 200 verdi. Yerel production readiness 503: veritabanı `ok`, dağıtık rate limiter `not_configured`. Production Redis bağlanmadan giriş/rezervasyon mutasyonları güvenlik nedeniyle kapalı kalır; yayın için bu operasyon engeli sürüyor.

### Önceki doğrulamalar (tarihsel)

Bu değerler 29 Eylül 2026 tarihinde tek geliştirme makinesindeki üretim build'inde ölçülmüştür; staging kapasite garantisi değildir.

- Üretim build'i: başarılı, 47 rota.
- TypeScript, ESLint ve birim testleri: başarılı; 17/17 test geçti.
- Playwright üretim sunucusu doğrulaması: 19 test geçti, 9 test bilinçli olarak atlandı, hata yok.
- Üretim bağımlılık taraması: bilinen güvenlik açığı yok.
- Isınmış üretim tarayıcı testi: ana sayfa masaüstü LCP 796 ms / CLS 0,0044; keşfet masaüstü LCP 1.172 ms; mobil ana sayfa LCP 520 ms; mobil keşfet LCP 200 ms.
- Güncel production build salt-okunur yük testi: 10.000 istek / 250 eşzamanlı bağlantı ve 20.000 istek / 500 eşzamanlı bağlantıda hata yok; ikinci koşu 498,43 istek/sn, p50 672 ms, p95 2.013 ms, p99 2.237 ms.
- Geçici dağıtık Redis ile `/api/health/ready` 200 döndü; rezervasyon mutasyonunda dağıtık oran sınırı 13. isteği 429 ile engelledi. Bu Redis örneği yalnızca doğrulama içindir ve kalıcı production altyapısının yerini tutmaz.
- Canlı Supabase büyüme/operasyon güvenlik denetimi: 8 RLS politikası, anonim/normal kullanıcı worker claim yetkisi `false`, yalnızca service-role `true`, bakım bucket'ı public `false`, 2 otomasyon trigger'ı aktif.
- Canlı Supabase danışmanları: Security Advisor 0 hata; Performance Advisor 0 hata ve 0 uyarı.
- Supabase erişilemezken soğuk başlangıç: 200/200 başarılı, p95 yaklaşık 1,97 sn; iki saniyelik güvenli veri zaman aşımı sonrasında boş durum gösterildi.
- 30 Eylül mobil/web son kapısı: Next.js 16.3.6 üretim build'i, Expo web export'u, Expo Doctor 21/21, ESLint, web+mobil TypeScript, 17/17 birim ve 19/19 çalışan E2E senaryosu geçti; 9 platforma özgü senaryo bilinçli atlandı.
- Son yerel üretim smoke yükü: 1.000 salt-okunur istek / 50 eşzamanlı bağlantı, 0 hata, 350,08 istek/sn, p95 356 ms, p99 733 ms. Bu sonuç staging kapasite garantisi değildir.
- Son ısınmış tarayıcı smoke ölçümünde masaüstü DCL ana sayfa 472 ms/keşfet 93 ms; mobil DCL ana sayfa 104 ms/keşfet 68 ms; tarayıcı sayfa hatası yok.

## Rakip analiziyle belirlenen P1 ürün boşlukları

Salonny'nin güçlü tarafı marketplace keşfi ile işletme panelini aynı üründe birleştirmesi. Pazarın olgun ürünlerinde aşağıdaki yetenekler belirgin şekilde öne çıkıyor:

- [x] Bekleme listesi: müşteri self-servis talebi, işletme kuyruğu, iptalde otomatik süreli teklif ve Randevularım ekranında kabul.
- [x] Sağlayıcı bağımsız SMS/WhatsApp/e-posta kuyruğu, atomik claim, üstel retry, dead-letter ve teslimat özeti.
- [x] Müşteri kartında alerji, anamnez, dijital onam, işlem notu ve özel depoda önce/sonra fotoğrafı.
- [x] Oda, koltuk ve cihazları hizmete bağlayan, transaction kilitli kapasite/çakışma kontrolü.
- [x] Grup/çoklu kişi, 52 kayda kadar tekrar eden randevu ve walk-in kaynağı.
- [x] Sunucu tarafında zorunlu rol/yetki matrisi, atanmış müşteri ve finans görünürlüğü.
- [ ] Türkçe/İngilizce başlıklı CSV müşteri içe/dışa aktarma hazır; hizmet içe aktarma, Excel ve yönlendirmeli taşıma sihirbazını ekle.
- [x] Takip edilebilir doğrudan rezervasyon linki, kendi sunucusunda QR, kopyalanabilir web widget'ı ve dönüşüm sayacı.
- [ ] Cookie tabanlı güvenli çoklu şube seçici ve karşılaştırmalı rapor hazır; şubeler arası personel/stok transferini ekle.
- [ ] Sadakat hesabı, paket tanımı/atama ve otomatik puan/seans işleme hazır; tavsiye ve geri-kazanım akışlarını ekle.
- [x] Açıklanabilir no-show risk uyarısı, 7 günlük düşük talep önerileri ve link/kampanya dönüşüm ölçümü.

## Rakip sinyalleri

- [Fresha](https://www.fresha.com/for-business/features): akıllı bekleme listesi, kaynak/oda planlama, formlar, ekip yetkileri, otomatik iletişim ve marketplace.
- [Kolay Randevu](https://www.kolayrandevu.com/randevu-programi/): WhatsApp hatırlatma, ayrıntılı yetkilendirme, çoklu şube ve yerel operasyon desteği.
- [Salontik](https://salontik.com/): 360 derece müşteri profili, vardiya/komisyon, stok, paket/seans, CSV içe aktarma ve Google Reserve.
- [Treatflow](https://www.treatflow.io/tr/features): dijital anamnez/onam, işlem kaydı, fotoğraf ve WhatsApp/e-posta hatırlatmaları.
- [Salun](https://salun.com.tr/): oda/terapist planlama, kritik müşteri, personel hakediş, Instagram DM ve yerel entegrasyonlar.

## Kalite komutları

```bash
pnpm typecheck
pnpm mobile:typecheck
pnpm lint
pnpm test
pnpm build
pnpm mobile:export
pnpm mobile:bundle
pnpm mobile:test:e2e
pnpm test:e2e
pnpm audit --prod
pnpm test:security
pnpm test:load
```

Yük testinin varsayılanı yerel sunucuya 200 salt-okunur istek ve 20 eşzamanlı bağlantıdır. Staging için `LOAD_TEST_URL`, `LOAD_TEST_REQUESTS` ve `LOAD_TEST_CONCURRENCY` değişkenleri kontrollü biçimde artırılmalıdır; production'a izinsiz yük testi yapılmamalıdır.
