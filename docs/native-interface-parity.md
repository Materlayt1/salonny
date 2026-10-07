# Native arayüz ve işletme paneli

7 Ekim 2026. Kullanıcı tercihi: tamamen native ekranlar; WebView kullanılmaz. Ödeme kapsam dışıdır.

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
- [x] Ana sayfanın alttaki tüm işletmeler akışı korunarak filtreler taslak/uygula/sıfırla panelinde toplandı. Keşfet araması ve etkin filtre özeti kaydırmadan bağımsız sabit kalır; sonuç yoksa tek dokunuşla temizleme vardır.
- [x] Kartların küçük meta yazıları büyütüldü; favori dokunma alanı 48×48, görsel simge 30×30 kaldı. Yükleme ekranında animasyonsuz kart yer tutucuları kullanılır; sahte işletme gösterilmez.
- [x] Randevu dört yönlendirmeli adıma ayrıldı; seçim/fiyat özeti ve devam/geri düğmeleri sabit. Hizmet/uzman/tarih değişimi veya API'de kaldırılan saat eski seçimi geçersiz kılar. 409 çakışması yeniden saat seçtirir; aynı işlemde hata sonrası tekrar aynı idempotency anahtarını kullanır.
- [x] Giriş/kayıt ve randevu formlarında kalıcı etiketler, alan bazlı hata ve klavye yönlendirmesi vardır. Web'de alan hata mesajının tıklanacak düğmeyi kaydırıp tıklamayı yutması düzeltildi; normal alan doğrulaması korundu.
- [x] İşletme detayı sekmeleri sabit ve kaydırmaya bağlı seçilidir. Gerçek fotoğraflar native tam ekran galeride açılır; 1–3× yakınlaştırma, gezinti, hata sonrası tekrar ve kapanış vardır. Koyu galeri native durum çubuğunu açık renge geçirir; fiziksel hareket testi hâlâ gereklidir.
- [x] Native işletme adı/telefon/açıklama, mevcut şube adresinin metin düzeltmesi ve yedi günlük açılış-kapanış saatleri yönetimi. Sahip/yönetici ve kayıt sahipliği kontrol edilir; harita koordinatları değişmez. Tüm haftayı kapatma ve kaydedilmemiş değişiklikleri bırakma açık onay ister.
- [x] Native kampanya oluşturma ve ad/hedef kitle düzenleme. Mevcut indirim koşulları ve durum korunur; otomatik iletişim gönderilmez. Mevcut oluşturma RPC'si ilk yetkili işletmeyi kullandığından diğer seçili işletmelerde oluşturma güvenle kapatılır; tam çoklu-işletme editörü tamamlandı sayılmaz.

Önceki turun canlı görsel kabulü: gerçek Gogo işletmeleriyle ana sayfa ve harita seçimi, iki salt-okunur senaryoda geçti (18 kontrollü + 2 canlı görsel = 20 mobil test). Son turda isteğe bağlı iki canlı görsel senaryosu yeniden çalıştırılmadı.

## Henüz birebir olmayan alanlar / sonraki kapsam

- [ ] Fiziksel cihazda native harita, izin reddi ve kamera kabul testi. Harita yalnız yüklenen sonuç sayfalarını gösterir; tüm ülkenin sınırsız işletmelerini tek seferde indirmez.
- [ ] Yüksek trafik öncesinde sözleşmeli/kendi barındırılan tile sağlayıcısı ve kapasite doğrulaması. `EXPO_PUBLIC_MAP_TILE_URL` değiştirilebilir; public OSM tile servisi SLA veya sınırsız kapasite sağlamaz.
- [ ] Native işletme onboarding, görsel yükleme, yeni konum/harita üzerinde taşınma; tarihe özel/çok parçalı ileri vardiya ve çalışma saati düzenleyicisi, çalışanı farklı şubelere atama. Temel işletme saatleri ve çalışan vardiya/izin/hizmet yönetimi tamamlandı. İleri plan koruması ön kontroldür; eşzamanlı dış DB değişikliğine karşı atomik kilit garantisi değildir.
- [ ] İşletmenin müşteri adına yeni randevu oluşturması; ileri operasyon/package/care/communication araçları.
- [ ] İşletme seçimini transaction içinde alan kampanya oluşturma RPC'si, indirim kodu/tutar/tarihlerini atomik düzenleme ve ayrıntılı rapor grafikleri. Şu an ilk yetkili işletmede kampanya oluşturma, metadata ve durum yönetimi vardır.
- [ ] Fiziksel iOS/Android cihaz kabul testi; mağaza imzalama, gerçek production HTTPS API adresi ve yayın hesapları.

Bu değişiklik bütün web sayfalarının pixel-perfect taşınması veya App Store/Play Store yayın onayı anlamına gelmez. Native ekranlar aynı Supabase veritabanını kullanır; sahte işletme/kimlik verisi eklenmez. Kontrollü E2E fixture verileri sadece test ortamına aittir.

## Yeniden doğrulama

`pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm mobile:typecheck`, `pnpm test:security`, `pnpm build`.

Yerel optimize önizleme: `pnpm mobile:export:preview` ardından `pnpm mobile:preview` (8082). Backend 3001'de çalışmalı. Bu export içine localhost yazılır; mağaza paketinde kullanılmaz. Geliştirme için `pnpm mobile:start --web --port 8082` kullanılır; iki sunucu aynı portta birlikte başlatılmaz.

`pnpm mobile:test:e2e` ortak akışları test eder. `MOBILE_LIVE_VISUAL=1` ile salt-okunur canlı görsel testi gerçek public işletmeleri kullanır. İmzalı APK/IPA yerine Hermes JavaScript export kontrolü ayrı bir build doğrulamasıdır.

Son turun doğrulaması (7 Ekim): 103 birim/yetki testi ve 64 mobil E2E senaryosu geçti (62 kontrollü akış + 2 salt-okunur canlı görsel). Auth/form senaryoları ayrıca 15/15, sekme kaydırması 5/5 tekrarda geçti; retry kullanılmadı. Next.js production build, web/mobil TypeScript, lint, güvenlik regresyon kapısı, Expo Doctor 21/21 ve Android/iOS Hermes export başarılı. Yeni işletme API'leri oturumsuz erişimi 401 ile reddetti. Gerçek çalışan/işletme/randevu kaydına test yazımı yapılmadı. Gerçek yetkili hesapla yazma kabulü, fiziksel cihaz ve mağaza kapıları hâlâ gereklidir.

MapLibre Native [Expo Go içinde çalışmaz](https://maplibre.org/maplibre-react-native/docs/setup/expo/); `eas build --profile development` veya `preview` ile özel native build gerekir. Hermes export imzalı APK/IPA değildir. [OSM tile kullanım politikası](https://operations.osmfoundation.org/policies/tiles/) doğrultusunda atıf korunur, native istemci uygulama User-Agent'i gönderir, ön indirme/offline harita yapılmaz.
