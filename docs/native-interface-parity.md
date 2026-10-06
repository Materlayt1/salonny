# Native arayüz ve işletme paneli

6 Ekim 2026. Kullanıcı tercihi: tamamen native ekranlar; WebView kullanılmaz. Ödeme kapsam dışıdır.

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
- [x] Ana sayfa ve keşifte isteğe bağlı harita, işletme seçimi ve kümelenmiş pinler. Android/iOS MapLibre Native, tarayıcı önizlemesi MapLibre GL JS kullanır; WebView yoktur.
- [x] Kullanıcı onayıyla ön plan konumu; API'ye iki ondalık basamağa yuvarlanmış yaklaşık koordinat gönderilir. Konum diske/profil kaydına yazılmaz; arka plan takibi yoktur.
- [x] Yakınlık ve fiyat sıralaması ile aktif hizmet adına arama Supabase'de tüm sonuçlara, sayfalama öncesinde uygulanır. Yeni invoker-rights RPC anonim rol ile kontrol edildi; mevcut SELECT RLS korunur.
- [x] Yakındaki/yüksek puanlı/yeni işletmeler, gerçek hizmetler ve onaylı yorum vitrinleri; alttaki filtreli işletme akışı korundu.
- [x] Gizlilik/KVKK/koşullar dış tarayıcı yerine native okuyucuda açılır; web ve mobil aynı kaynak metni kullanır. Mevcut metinler hukuki onay almış sayılmaz.
- [x] Doğrudan paylaşılan harita URL'sinin statik HTML hydration hatası düzeltildi; pin seçimi E2E'de doğrulandı. Kontrollü harita testleri OSM sunucuları yerine test tile yanıtı kullanır.

Ek canlı görsel kabul: gerçek Gogo işletmeleriyle ana sayfa ve harita seçimi, iki salt-okunur senaryoda geçti (18 kontrollü + 2 canlı görsel = 20 mobil test).

## Henüz birebir olmayan alanlar / sonraki kapsam

- [ ] Fiziksel cihazda native harita, izin reddi ve kamera kabul testi. Harita yalnız yüklenen sonuç sayfalarını gösterir; tüm ülkenin sınırsız işletmelerini tek seferde indirmez.
- [ ] Yüksek trafik öncesinde sözleşmeli/kendi barındırılan tile sağlayıcısı ve kapasite doğrulaması. `EXPO_PUBLIC_MAP_TILE_URL` değiştirilebilir; public OSM tile servisi SLA veya sınırsız kapasite sağlamaz.
- [ ] Native işletme onboarding, görsel yükleme, çalışma saati/vardiya yönetimi ve çalışan-hizmet eşleştirme düzenleyicisi.
- [ ] İşletmenin müşteri adına yeni randevu oluşturması; ileri operasyon/package/care/communication araçları.
- [ ] Kampanya oluşturma ve ayrıntılı rapor grafikleri. Bu sürüm mevcut kampanyaların durumunu ve randevu rapor kayıtlarını yönetir.
- [ ] Fiziksel iOS/Android cihaz kabul testi; mağaza imzalama, gerçek production HTTPS API adresi ve yayın hesapları.

Bu değişiklik bütün web sayfalarının pixel-perfect taşınması veya App Store/Play Store yayın onayı anlamına gelmez. Native ekranlar aynı Supabase veritabanını kullanır; sahte işletme/kimlik verisi eklenmez. Kontrollü E2E fixture verileri sadece test ortamına aittir.

## Yeniden doğrulama

`pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm mobile:typecheck`, `pnpm test:security`, `pnpm build`.

Yerel optimize önizleme: `pnpm mobile:export:preview` ardından `pnpm mobile:preview` (8082). Backend 3001'de çalışmalı. Bu export içine localhost yazılır; mağaza paketinde kullanılmaz. Geliştirme için `pnpm mobile:start --web --port 8082` kullanılır; iki sunucu aynı portta birlikte başlatılmaz.

`pnpm mobile:test:e2e` ortak akışları test eder. `MOBILE_LIVE_VISUAL=1` ile salt-okunur canlı görsel testi gerçek public işletmeleri kullanır. İmzalı APK/IPA yerine Hermes JavaScript export kontrolü ayrı bir build doğrulamasıdır.

Bu turun doğrulaması: 54 birim/yetki testi ve 18 kontrollü mobil E2E senaryosu geçti. Next.js production build, Expo Doctor 21/21 ve Android/iOS Hermes export kontrolleri başarılı. CI mobil akışları optimize statik export üzerinde çalıştırır; yeniden derleme kaynaklı test zaman aşımını ürün hatasıyla karıştırmaz. Native panelde gerçek hesaptan yazma işlemi ve fiziksel cihaz testi hâlâ kabul aşamasıdır.

MapLibre Native [Expo Go içinde çalışmaz](https://maplibre.org/maplibre-react-native/docs/setup/expo/); `eas build --profile development` veya `preview` ile özel native build gerekir. Hermes export imzalı APK/IPA değildir. [OSM tile kullanım politikası](https://operations.osmfoundation.org/policies/tiles/) doğrultusunda atıf korunur, native istemci uygulama User-Agent'i gönderir, ön indirme/offline harita yapılmaz.
