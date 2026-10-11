# Salonny üretim hazırlığı ve ürün TO-DO listesi

Son güncelleme: 11 Ekim 2026. Ödeme ve online depozito bu çalışmanın kapsamı dışındadır.

Mobil native arayüz ve işletme paneli ilerlemesi: [ayrıntılı tamamlananlar ve kalan eşleşmeler](docs/native-interface-parity.md), [ileri panel yapılacaklar](docs/advanced-panel-todo.md). 11 Ekim'de 028/029 + 030 canlı kuruldu; 267 birim, 8 izole SQL motor ve 12 kurulum/yetki kontrolü geçti. Önceki 10 Ekim mobil E2E kaydı 104/104 (102 kontrollü + 2 canlı public görsel); bu, mağaza veya yüksek trafik yayın onayı değildir.

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
- [x] Native harita/konum, hizmet ve yorum vitrinleri, ortak kaynaklı native yasal metinler; Supabase'de sayfalama öncesi fiyat/yakınlık/hizmet araması eklendi. `202610060025_public_marketplace_search.sql` canlı projeye uygulandı; anonim rol ve invoker hakları kontrol edildi.
- [x] 6 Ekim source-map-js DoS ve sharp/librsvg RCE advisory'leri düzeltilmiş upstream sürümlerine yükseltilerek kapatıldı; mevcut iki dar kapsamlı yerel yamanın regresyon kapısı korundu.
- [x] Native çalışan yetkinliği, haftalık vardiya ve izin/blok yönetimi ortak API'ye bağlandı. İşletme/şube sahipliği ve kayıt sınırları kontrol edilir; mevcut tarihli/çok parçalı vardiyalar basit editörle ezilmez. Gerçek işletmenin çalışma planı test amacıyla değiştirilmedi.
- [x] 10 Ekim: native müşteri adına randevu ve paket/seans yönetimi; `202610070026`/`202610070027` canlı migration'ları onayla kuruldu. Anon RPC, özel tekrar defteri, tenant FK'leri ve yönetici paket RLS doğrulandı; gerçek müşteri/randevu test yazımı yapılmadı. Ayrıntılı kapsam/kalanlar native eşleşme belgesindedir.
- [x] 10 Ekim: altı yeni Next.js advisory'si 16.3.8 patch güncellemesiyle düzeltildi; eşleşen ESLint config, 159 birim testi, production build ve mevcut transitive yama regresyon kapısı doğrulandı. Güvenlik kapısı `unresolved: []`; ham audit'teki yerel olarak yamalanmış iki kayıt bastırılmadı.

## Canlıya çıkmadan önce tamamlanması gereken P0 operasyon işleri

- [x] `202610070027` dahil önceki Supabase migrasyonları production'a uygulandı ve salt-okunur güvenlik sorgusuyla doğrulandı.
- [x] `202610100028` bekleme listesi / `202610100029` kaynak yönetimi ve kalan varsayılan hakları kapatan `202610110030` canlı kuruldu; geçmiş, ACL/tenant/tetikleyici ve fonksiyon gövdesi eşleşmesi doğrulandı. İzole SQL motor 8/8 geçti. Gerçek JWT/RLS/yazım ve eşzamanlı staging kapasite kabulü ayrıca gerekir.
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
- [ ] Mobil harita için özel native build ve yüksek trafik tile sağlayıcısını doğrula; public OSM tile servisi SLA/sınırsız kapasite sağlamaz.
- [x] Gizli anahtar rotasyonu, olay müdahale planı, SLO, kapasite/yük testi ve geri yükleme runbook'unu yazılı hale getir.

## Son yerel doğrulama sonuçları

11 Ekim giriş düzeltmesi: kullanıcı localhost'ta kendi hesabıyla girişi doğruladı; hata adresi Vercel Preview. SDK sürüm başlığı/hata durumu uyumu, güvenlik kapısı hata gövdesi ve SSR erken yazım koruması düzeltildi. 303/303 birim, desktop+mobil 12/12 kontrollü web E2E (retry yok), web TypeScript/lint/güvenlik kapısı ve production build geçti. Preview'da eski genel hata sentetik geçersiz kimlikle tekrarlandı; gerçek hesap/parola değiştirilmedi. Yönetim bağlantısı olmadan Preview ortamı/Redis/build commit'i ve gerçek Vercel hesap girişi doğrulanmış sayılmaz. [Dağıtım kabul adımları ve bulgular](docs/auth-deployment-troubleshooting.md).

11 Ekim onaylı canlı kurulum: 028/029 ve ek yetki kapama 030 başarılı. 12/12 salt-okunur metadata denetimi, 11/11 repo fonksiyon gövdesi eşleşmesi, 8/8 geçici tablo SQL motor testi ve 267/267 birim testi geçti. 030 tablo/kolon TRUNCATE/REFERENCES/TRIGGER/MAINTAIN dahil gereksiz varsayılan hakları kapattı; bu ek düzeltme mevcut RLS/işlevleri/verileri değiştirmedi. Anonim iki RPC ve iki korumalı REST tablo çağrısı 401; iki yeni oturumsuz API 401. Public dizin iki işletmeyle 200, development readiness 200/DB ok/Redis optional. Gerçek müşteri/randevu/kaynak test kaydı yazılmadı, geçici nesneler rollback oldu. Yeni native kaynak değişmediği için 104 mobil E2E ve derleme kayıtları 10 Ekim'deki son koşuya aittir; production Redis, gerçek staging yarış/yük, cihaz/mağaza kapıları açık kalır.

10 Ekim önceki kod turu: native bekleme listesi ve kaynak ekranları; webde ham bekleme/kaynak yazımları yerine kapsamlı atomik RPC'ler. 263 birim/yetki testi, tam mobil **104/104** E2E (102 kontrollü + 2 salt-okunur Gogo görsel, retry yok), web/mobil tip, lint, güvenlik kapısı (`unresolved: []`), Next.js 16.3.8 production build ve Android/iOS Hermes + web export başarılı. O tarihte son migration 027, yeni şema onayı bekleniyordu; 11 Ekim canlı sonuçları yukarıdadır. Bu kapı genel production GO değildir.

7 Ekim geliştirme sunucusu readiness 200: veritabanı `ok`, dağıtık rate limiter `optional_in_development`. Bu yanıt production Redis/altyapı kapısının geçtiğini göstermez.

7 Ekim native UX ve panel kapısı: filtre paneli/sabit arama, dört adımlı sabit özetli rezervasyon, kalıcı form etiketleri, büyük dokunma hedefleri, sticky işletme sekmeleri ve gerçek fotoğraf galerisi tamamlandı. Native işletme profil/mevcut adres/haftalık saatler ve temel kampanya editörü eklendi; kapsam sınırları native eşleşme listesinde açıkça kayıtlıdır. 103 birim/yetki ve 64 mobil E2E testi geçti (62 kontrollü + 2 canlı public görsel); form odağı ayrıca 15, sekme kaydırması 5 tekrarda geçti. Web/mobil TypeScript, lint, Next.js production build, güvenlik kapısı, Expo Doctor 21/21 ve Android/iOS Hermes export başarılı. Oturumsuz yeni panel API'leri 401 döndü. Gerçek işletme planı, kampanya veya randevu test için değiştirilmedi. İmzalı APK/IPA ya da fiziksel cihaz kabulü yapılmadı; kullanıcı mağaza hesaplarının hazır olmadığını belirterek kod/test aşamasını seçti.

6 Ekim tipografi kontrolü: mobil başlık/düğme kalınlıkları 600, filtre/menü etiketleri 500 olacak şekilde yumuşatıldı; ana metin rengi `#30313B`. Giriş metin kontrastı ve 320/390/768 px form yerleşimi, ana sayfa başlıkları ve profil etiketleri için üç ek E2E senaryosu geçti. Toplam 28 kontrollü mobil test, 67 birim/yetki testi, lint ve mobil TypeScript başarılı. İki isteğe bağlı canlı görsel senaryo yeniden çalıştırılmadı. Web ve backend davranışları değiştirilmedi.

6 Ekim çalışan araçları kapısı: native hizmet yetkinliği, şubeye özel haftalık vardiya ve tüm şubelerde izin/blok yönetimi eklendi. 67 birim/yetki testi ve 25 kontrollü mobil E2E testi geçti; web/mobil TypeScript, lint, güvenlik regresyonları, Next.js production build ve Android/iOS Hermes export başarılı. Yeni ekip API'si oturumsuz erişimi, canlı vardiya/izin RPC'leri anonim çalıştırmayı reddetti. Gerçek çalışan kayıtları değiştirilmedi; gerçek hesapla yazma kabulü hâlâ gereklidir. İlk açılışta erken arama yazımının kaybolması düzeltildi. İki isteğe bağlı canlı görsel test bu turda yeniden çalıştırılmadı.

6 Ekim önceki native eşleşme kapısı: 54 birim/yetki ve 18 kontrollü mobil E2E testi geçti; Next.js production build, Expo Doctor 21/21 ve tüm platform export'u doğrulandı. Canlı public API'de aktif hizmet araması (`kesim`), fiyat sıralaması ve yuvarlanmış test koordinatlarıyla gerçek mesafe sıralaması çalıştı; konumlu yanıt `private, no-store`. İki gerçek işletme üzerinden doğrulama yüksek trafik/veri kapasite testi değildir. Fiziksel cihaz ve production operasyon kapıları açık kalır.

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
