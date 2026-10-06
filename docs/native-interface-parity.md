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
- [x] Çalışan kartında native hizmet yetkinliği, seçili şubeye haftalık vardiya ve tüm şubelerde geçerli izin/tatil/blok/mola yönetimi. Hizmetler ve izin kayıtları 50'lik sayfalarla yüklenir.
- [x] Her hizmet seçimi tek bağlantı işlemiyle kaydedilir; diğer yetkinlikler ve özel fiyat override'ları korunur. Yetkinlik/izinler tüm şubelerde ortaktır; vardiya seçili şubeye özeldir ve ekranda açıklanır.
- [x] Saat/tarih doğrulaması cihaz saat diliminden bağımsız İstanbul saatini kullanır; geçersiz gün, ters aralık ve yinelenen vardiya günleri reddedilir. İzin kaldırma ve boş vardiyayla işletme saatlerine dönme kullanıcı onayı ister.
- [x] Ekip araçları owner/manager yetkisi, çalışan-işletme/şube eşleşmesi, hizmet ve izin kaydı sahipliği ile kritik rate limiter tarafından korunur. Tarihe özel/çok parçalı mevcut vardiyalar basit editörle silinmez; düzenleme güvenle kapatılır.
- [x] Statik önizlemede arama alanları React etkileşimi hazır olana kadar kapalıdır; ilk açılışta erken yazılan aramanın kaybolması önlendi. Vardiya saat alanları dar telefon ekranına sığacak şekilde düzenlendi.
- [x] Tipografi yumuşatıldı: başlık ve düğmeler 600, filtre/menü etiketleri 500 ağırlığa indirildi; ana metin rengi `#30313B` oldu. Marka logosu korunur. Giriş formu geniş ekranda 440 px ile sınırlı; başlıklarda satır aralığı iyileştirildi. Giriş metinlerinin kontrastı ve 320/390/768 px form yerleşimi E2E ile doğrulandı.

Önceki turun canlı görsel kabulü: gerçek Gogo işletmeleriyle ana sayfa ve harita seçimi, iki salt-okunur senaryoda geçti (18 kontrollü + 2 canlı görsel = 20 mobil test). Son turda isteğe bağlı iki canlı görsel senaryosu yeniden çalıştırılmadı.

## Henüz birebir olmayan alanlar / sonraki kapsam

- [ ] Fiziksel cihazda native harita, izin reddi ve kamera kabul testi. Harita yalnız yüklenen sonuç sayfalarını gösterir; tüm ülkenin sınırsız işletmelerini tek seferde indirmez.
- [ ] Yüksek trafik öncesinde sözleşmeli/kendi barındırılan tile sağlayıcısı ve kapasite doğrulaması. `EXPO_PUBLIC_MAP_TILE_URL` değiştirilebilir; public OSM tile servisi SLA veya sınırsız kapasite sağlamaz.
- [ ] Native işletme onboarding, görsel yükleme, işletmenin açılış-kapanış saatlerini düzenleme; tarihe özel/çok parçalı ileri vardiya düzenleyicisi ve çalışanı farklı şubelere atama. Temel çalışan vardiya/izin/hizmet yönetimi tamamlandı.
- [ ] İşletmenin müşteri adına yeni randevu oluşturması; ileri operasyon/package/care/communication araçları.
- [ ] Kampanya oluşturma ve ayrıntılı rapor grafikleri. Bu sürüm mevcut kampanyaların durumunu ve randevu rapor kayıtlarını yönetir.
- [ ] Fiziksel iOS/Android cihaz kabul testi; mağaza imzalama, gerçek production HTTPS API adresi ve yayın hesapları.

Bu değişiklik bütün web sayfalarının pixel-perfect taşınması veya App Store/Play Store yayın onayı anlamına gelmez. Native ekranlar aynı Supabase veritabanını kullanır; sahte işletme/kimlik verisi eklenmez. Kontrollü E2E fixture verileri sadece test ortamına aittir.

## Yeniden doğrulama

`pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm mobile:typecheck`, `pnpm test:security`, `pnpm build`.

Yerel optimize önizleme: `pnpm mobile:export:preview` ardından `pnpm mobile:preview` (8082). Backend 3001'de çalışmalı. Bu export içine localhost yazılır; mağaza paketinde kullanılmaz. Geliştirme için `pnpm mobile:start --web --port 8082` kullanılır; iki sunucu aynı portta birlikte başlatılmaz.

`pnpm mobile:test:e2e` ortak akışları test eder. `MOBILE_LIVE_VISUAL=1` ile salt-okunur canlı görsel testi gerçek public işletmeleri kullanır. İmzalı APK/IPA yerine Hermes JavaScript export kontrolü ayrı bir build doğrulamasıdır.

Son turun doğrulaması: 67 birim/yetki testi ve 28 kontrollü mobil E2E senaryosu geçti. Next.js production build, web/mobil TypeScript, lint, güvenlik regresyon kapısı ve Android/iOS Hermes export başarılı. Expo Doctor önceki turda 21/21 geçti; bu turda bağımlılıklar değişmedi. Ekip API'sinin oturumsuz erişimi ve canlı vardiya/izin RPC'lerinin anonim çalıştırılması reddedildi. Gerçek çalışan kayıtlarına test yazımı yapılmadı. CI mobil akışları optimize statik export üzerinde çalıştırır. Native panelde gerçek yetkili hesapla yazma kabulü ve fiziksel cihaz testi hâlâ gereklidir.

MapLibre Native [Expo Go içinde çalışmaz](https://maplibre.org/maplibre-react-native/docs/setup/expo/); `eas build --profile development` veya `preview` ile özel native build gerekir. Hermes export imzalı APK/IPA değildir. [OSM tile kullanım politikası](https://operations.osmfoundation.org/policies/tiles/) doğrultusunda atıf korunur, native istemci uygulama User-Agent'i gönderir, ön indirme/offline harita yapılmaz.
