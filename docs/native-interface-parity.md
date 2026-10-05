# Native arayüz ve işletme paneli

5 Ekim 2026. Kullanıcı tercihi: tamamen native ekranlar; WebView kullanılmaz. Ödeme kapsam dışıdır.

## Bu turda uygulananlar

- [x] Webdeki gerçek `public/brand/salonny-mark.png` marka varlığı uygulamada kullanılıyor.
- [x] Açık renkli ana ekran, arama alanı, pastel kategoriler, SVG ikonları ve webdeki beşli alt menü düzeni taşındı.
- [x] Yatay vitrin kartları görsel solda/metin sağda olacak şekilde düzenlendi; filtreli, sayfalı tüm işletmeler akışı altta korundu.
- [x] Kartlardan favori işlemi eklendi; kart başına ayrı ağ isteği yerine kullanıcıya ait ortak session-summary sorgu anahtarı kullanılıyor.
- [x] Profildeki işletme düğmesi dış tarayıcı yerine `/manage/[section]` native panelini açıyor.
- [x] Native panel: özet, günlük takvim, randevu durumu yönetimi, müşteriler, hizmetler, çalışanlar, rapor kayıtları, stok, kampanya durumları, operasyon görünümü ve randevu ayarları.
- [x] Müşteri/hizmet/çalışan/ürün oluşturma ve düzenleme; stok artırma/azaltma; ayar kaydetme gerçek API üzerinden çalışıyor.
- [x] Yetkili işletme ve şube seçimi; geçiş sırasında önceki şubeye yanlışlıkla işlem yapılmasını engelleyen yükleme katmanı.
- [x] API tokenı Supabase tarafından doğrulanıyor; aktif üyelik, işletme ve şube sınırı, çalışan randevu kapsamı, bölüm izinleri ve finansal görünürlük kontrol ediliyor.
- [x] Takvim İstanbul gün sınırını kullanıyor; geçersiz tarihler reddediliyor. Listeler 50 kayıtlık sayfalarla sınırlandırılıyor.
- [x] İşletme detayında hizmet seçimi, uzmanlar, yorumlar, çalışma saatleri, paylaşım ve sabit randevu düğmesi.
- [x] Windows Metro dosya tutamacı tükenmesine karşı worker sınırı ve üretilen/ara dosya klasörlerinin dışlanması.
- [x] Statik yerel önizleme, sadece önizlemeye enjekte edilen API URL'si; farklı ortamın API adresini önbellekten taşımamak için temiz export.

## Henüz birebir olmayan alanlar / sonraki kapsam

- [ ] Native keşif haritası ve gerçek konuma göre yakınlık sıralaması; mevcut ekran liste/şehir/kategori/sıralama filtrelerini kullanıyor.
- [ ] Web ana ekranındaki canlı harita, popüler hizmet ve doğrulanmış yorum vitrinlerinin tamamının taşınması.
- [ ] Native işletme onboarding, görsel yükleme, çalışma saati/vardiya yönetimi ve çalışan-hizmet eşleştirme düzenleyicisi.
- [ ] İşletmenin müşteri adına yeni randevu oluşturması; ileri operasyon/package/care/communication araçları.
- [ ] Kampanya oluşturma ve ayrıntılı rapor grafikleri. Bu sürüm mevcut kampanyaların durumunu ve randevu rapor kayıtlarını yönetir.
- [ ] Yasal metinlerin native okuyucusu; mevcut gizlilik/KVKK/koşul bağlantıları webde açılır (işletme paneli webde açılmaz).
- [ ] Fiziksel iOS/Android cihaz kabul testi; mağaza imzalama, gerçek production HTTPS API adresi ve yayın hesapları.

Bu değişiklik bütün web sayfalarının pixel-perfect taşınması veya App Store/Play Store yayın onayı anlamına gelmez. Native ekranlar aynı Supabase veritabanını kullanır; sahte işletme/kimlik verisi eklenmez. Kontrollü E2E fixture verileri sadece test ortamına aittir.

## Yeniden doğrulama

`pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm mobile:typecheck`, `pnpm test:security`, `pnpm build`.

Yerel optimize önizleme: `pnpm mobile:export:preview` ardından `pnpm mobile:preview` (8082). Backend 3001'de çalışmalı. Bu export içine localhost yazılır; mağaza paketinde kullanılmaz. Geliştirme için `pnpm mobile:start --web --port 8082` kullanılır; iki sunucu aynı portta birlikte başlatılmaz.

`pnpm mobile:test:e2e` ortak akışları test eder. `MOBILE_LIVE_VISUAL=1` ile salt-okunur canlı görsel testi gerçek public işletmeleri kullanır. İmzalı APK/IPA yerine Hermes JavaScript export kontrolü ayrı bir build doğrulamasıdır.

Bu turun doğrulaması: 47 birim/yetki testi, 13 kontrollü mobil E2E senaryosu, lint, iki TypeScript kontrolü, Next.js production build ve Expo Doctor 21/21 geçti. Gerçek public veriyi kullanan ek görsel test de geçti. CI mobil akışları optimize statik export üzerinde çalıştırır; yeniden derleme kaynaklı test zaman aşımını ürün hatasıyla karıştırmaz. Native panelde gerçek hesaptan yazma işlemi ve fiziksel cihaz testi hâlâ kabul aşamasıdır.
