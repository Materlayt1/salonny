# Salonny üretim hazırlığı ve ürün TO-DO listesi

Son güncelleme: 13 Eylül 2026. Ödeme ve online depozito bu çalışmanın kapsamı dışındadır.

## Tamamlanan P0 işleri

- [x] Next.js ve MapLibre kritik güvenlik güncellemeleri uygulandı; üretim bağımlılık taraması temizlendi.
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

## Canlıya çıkmadan önce tamamlanması gereken P0 operasyon işleri

- [ ] `202608180019_production_scale_indexes.sql` dahil tüm Supabase migrasyonlarını staging ve production'a uygula.
- [ ] Production ortamında Upstash Redis değişkenlerini tanımla; readiness ucu `200 ready` vermeden trafik açma.
- [ ] Supabase bağlantı havuzu, PITR/yedekleme, geri yükleme tatbikatı ve kota alarmlarını etkinleştir.
- [ ] Yapılandırılmış logları kalıcı bir gözlemleme sistemine aktar; hata oranı, p95/p99 gecikme, Core Web Vitals ve rezervasyon başarısı için alarm tanımla.
- [ ] Gerçek CDN, production alan adı ve temsili görsellerle Lighthouse/alan verisini tekrar ölç; p75 hedeflerini LCP ≤ 2,5 sn, INP ≤ 200 ms ve CLS ≤ 0,1 olarak alarm koşullarına bağla.
- [ ] CDN/WAF üzerinde bot, DDoS ve ülke bazlı anomali kuralları kur; health uçlarını load balancer'a bağla.
- [ ] Gerçekçi anonimleştirilmiş staging verisiyle k6/Artillery üzerinde kademeli 1k, 10k ve hedef eşzamanlılık testleri yap. “Milyon trafik” garantisi ancak bu test, kota ve altyapı ölçümleriyle verilebilir.
- [ ] Supabase RLS ve `SECURITY DEFINER` fonksiyonları için ayrı bir penetrasyon testi çalıştır.
- [ ] Gizli anahtar rotasyonu, olay müdahale planı, SLA/SLO ve kapasite bütçesini yazılı hale getir.

## Son yerel doğrulama sonuçları

Bu değerler 13 Eylül 2026 tarihinde tek geliştirme makinesindeki üretim build'inde ölçülmüştür; staging kapasite garantisi değildir.

- Üretim build'i: başarılı, 43 rota.
- TypeScript, ESLint ve birim testleri: başarılı; 4 dosyada 10/10 test geçti.
- Playwright: masaüstü ve mobil pakette 13 test geçti, 13 test ortamda yayınlanmış işletme/oturum bulunmadığı veya karşı proje türüne ait olduğu için bilinçli olarak atlandı.
- Üretim bağımlılık taraması: bilinen güvenlik açığı yok.
- Lighthouse: performans 88, erişilebilirlik 100, iyi uygulamalar 100, SEO 100; FCP 953 ms, TBT 75 ms, CLS 0. Lighthouse'ın simüle LCP değeri 3,8 sn; uygulamanın gerçek kullanıcı telemetrisi aynı koşuda yaklaşık 960 ms LCP kaydetti.
- Isınmış salt-okunur yük testi: 1.000 istek, 50 eşzamanlı bağlantı, 1.000/1.000 başarılı; 704,23 istek/sn, p95 123 ms, p99 155 ms.
- Supabase erişilemezken soğuk başlangıç: 200/200 başarılı, p95 yaklaşık 1,97 sn; iki saniyelik güvenli veri zaman aşımı sonrasında boş durum gösterildi.

## Rakip analiziyle belirlenen P1 ürün boşlukları

Salonny'nin güçlü tarafı marketplace keşfi ile işletme panelini aynı üründe birleştirmesi. Pazarın olgun ürünlerinde aşağıdaki yetenekler belirgin şekilde öne çıkıyor:

- [ ] Bekleme listesini uçtan uca tamamla: müşteri talebi, işletme kuyruğu, boşluk oluşunca teklif, süreli kabul ve otomatik sıradaki müşteriye geçiş.
- [ ] Sağlayıcı bağımsız SMS/WhatsApp/e-posta iş kuyruğu, retry, dead-letter ve teslimat raporu ekle.
- [ ] Müşteri kartına alerji, anamnez, dijital onam, işlem notu ve önce/sonra fotoğrafı ekle.
- [ ] Oda, koltuk ve cihaz gibi kaynakları hizmete bağlayıp çalışanla birlikte çakışmasız planla.
- [ ] Grup/çoklu kişi, tekrar eden randevu ve walk-in sıra yönetimi ekle.
- [ ] Rol bazlı ayrıntılı yetki matrisi ve çalışan bazlı görünürlük kuralları ekle.
- [ ] CSV/Excel müşteri-hizmet içe aktarma, dışa aktarma ve veri taşıma sihirbazı ekle.
- [ ] Doğrudan rezervasyon linki, QR kod, web widget'ı ve sosyal medya dönüşüm takibi ekle.
- [ ] Çoklu şube bağlam seçici, şubeler arası personel/stok ve karşılaştırmalı raporlar ekle.
- [ ] Sadakat, üyelik, hizmet paketi, tavsiye ve geri-kazanım otomasyonları ekle.
- [ ] İptal/no-show tahmini, doluluk önerileri ve kampanya performans ölçümü ekle.

## Rakip sinyalleri

- [Fresha](https://www.fresha.com/for-business/features): akıllı bekleme listesi, kaynak/oda planlama, formlar, ekip yetkileri, otomatik iletişim ve marketplace.
- [Kolay Randevu](https://www.kolayrandevu.com/randevu-programi/): WhatsApp hatırlatma, ayrıntılı yetkilendirme, çoklu şube ve yerel operasyon desteği.
- [Salontik](https://salontik.com/): 360 derece müşteri profili, vardiya/komisyon, stok, paket/seans, CSV içe aktarma ve Google Reserve.
- [Treatflow](https://www.treatflow.io/tr/features): dijital anamnez/onam, işlem kaydı, fotoğraf ve WhatsApp/e-posta hatırlatmaları.
- [Salun](https://salun.com.tr/): oda/terapist planlama, kritik müşteri, personel hakediş, Instagram DM ve yerel entegrasyonlar.

## Kalite komutları

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
pnpm audit --prod
pnpm test:load
```

Yük testinin varsayılanı yerel sunucuya 200 salt-okunur istek ve 20 eşzamanlı bağlantıdır. Staging için `LOAD_TEST_URL`, `LOAD_TEST_REQUESTS` ve `LOAD_TEST_CONCURRENCY` değişkenleri kontrollü biçimde artırılmalıdır; production'a izinsiz yük testi yapılmamalıdır.
