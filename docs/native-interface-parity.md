# Native arayüz ve işletme paneli

11 Ekim 2026. Kullanıcı tercihi: tamamen native ekranlar; WebView kullanılmaz. Ödeme kapsam dışıdır.

İleri panel için [tamamlananlar ve öncelikli yapılacaklar](advanced-panel-todo.md) ayrı listede tutulur.

## Bu turda uygulananlar

- [x] İleri tarihli/çok parçalı dönem ve şube ataması için native ekran/API kodu eklendi. Pasif şube temizliği, tam hassasiyet snapshot'ı, çakışma/taslak koruması ve bağımsız sayfalama var. 031 canlı kurulum açık onayla tamamlandı; [kapsam ve kabul](native-staff-schedules.md).
- [x] Web ile ortak müşteri kupon uygulama, indirim özeti ve işletme detayında kod duyurusu eklendi. Hizmet/uzman değişimi veya terk edilmiş seçimden geç gelen yanıt eski indirimi geri getirmez. Tek kullanım defteri için 032 canlı kurulum açık onayla tamamlandı; [davranış ve güvenlik](customer-coupons.md).

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
- [x] Özet/takvim/randevular bölümünden müşteri adına tek hizmetlik yeni randevu: müşteri, hizmet/uzman, işletme saat diliminde gün/saat ve son onay. Seçili işletme/şube ve aktif sahip/yönetici üyeliği doğrulanır. Müşteri kullanıcı kimliği yöneticiden alınmaz; müşterinin mevcut kaydından gelir. Tekrarlanan saatler birleştirilir, çakışma yeniden seçim ister; belirsiz yanıtta aynı işlem anahtarı korunur.
- [x] Operasyon bölümünden native paket/seans araçları: paket oluşturma, ad/geçerlilik/aktiflik düzenleme, müşteriye onaylı tanımlama, kalan bakiye/son kullanma tarihi, arama ve 25'lik sayfalama. Paketler işletmenin tüm şubelerinde ortaktır. Kayıtlı başlangıç bakiyesi/işlem defteri olmadığı için kullanılan seans tahmin edilmez; ödeme ve elle bakiye düzeltmesi yoktur.
- [x] `202610070026_native_staff_booking` ve `202610070027_native_package_security`, kullanıcının açık onayıyla canlı Supabase projesine kuruldu ve migration geçmişine işlendi. Randevu tekrar defteri istemcilere kapalı; RPC anonim rol için kapalıdır. Paketler işletmeler arası FK'ler ve yönetici RLS ile korunur; hizmet/seans içeriği değişmez. Doğrulanmış compound FK'ler eski tek kolon ilişkilerinin yerini aldı; PostgREST embed belirsizliği yaratılmadı. Paket tüketim kilidi yalnız müşteri paketini bekler; metadata düzenlemesi tüketimi sessizce atlatmaz. Altyapı işlevi olmadan native paket API'si 503 verir.
- [x] Yerel static önizleme dinamik işletme/randevu/panel bağlantılarına ana sayfa HTML'si yerine doğru Expo route-template HTML'sini verir. Doğrudan panel açılışındaki React hydration hatası düzeltildi; bilinmeyen rotalar/eksik varlıklar HTML fallback almaz.
- [x] Operasyon bölümünde native bekleme listesi yönetimi: mevcut müşteri seçimi, arama/durum/sayfalama, tarih/uzman/öncelik/not düzenleme, onaylı soft-cancel ve uygun saatte 5–120 dakikalık teklif hazırlama. Teklif ileti göndermez veya rezervasyon yapmaz. 409 sonrası taslak korunur, güncel kayıt/saat yeniden seçilmeden tekrar yazılmaz; eski grup kayıtları yalnız iptal edilir.
- [x] Operasyon bölümünde native oda/koltuk/cihaz yönetimi: kapasite/aktiflik, tek hizmet bağlantısı ve ihtiyaç birimleri, 24 saat/7 gün/30 gün kullanım özeti ve sayfalı rezervasyon birimleri. Toplam/tepe kullanım yalnız görünen sayfadan tahmin edilmez. Mevcut/gelecek rezervasyon varken kapasite azaltma veya pasife alma güvenle reddedilir.
- [x] Web operasyon işlemleri güvenli RPC'lere geçirildi: kaynak ve başlangıç hizmetleri tek transaction'da, bekleme durumu expectedUpdatedAt ile, yalnız sahip/yönetici ve seçili şubede. Başarısız form gönderimi taslağı sıfırlamaz; aynı denemede anahtar korunur. Bekleyen talep doğrudan kabul edilemez; canlı teklif gerekir. Müşteri telefon sahipliği hatası kişisel veri açıklamadan gösterilir.

Önceki görsel kabul kayıtları aşağıda tarihseldir. 034–037 native özellikleri ve 13 Ekim 52/52 canlı kabulünün kapsamı [son tamamlama kaydında](native-advanced-completion.md) tutulur; eski export sonuçları yeni kaynak için kullanılmaz.

## Henüz birebir olmayan alanlar / sonraki kapsam

- [ ] Fiziksel cihazda native harita, izin reddi ve kamera kabul testi. Harita yalnız yüklenen sonuç sayfalarını gösterir; tüm ülkenin sınırsız işletmelerini tek seferde indirmez.
- [ ] Yüksek trafik öncesinde sözleşmeli/kendi barındırılan tile sağlayıcısı ve kapasite doğrulaması. `EXPO_PUBLIC_MAP_TILE_URL` değiştirilebilir; public OSM tile servisi SLA veya sınırsız kapasite sağlamaz.
- [x] Native ilk işletme onboarding/devam, kategori/iletişim, public kapak/galeri yayınlama ve seçili şube konumu/harita pini; 037 canlı kuruldu. İncelemeye gönderme otomatik yayın değildir.
- [ ] Native ilave işletme oluşturma ve tarihe özel işletme çalışma saati editörü. Çalışan ileri vardiya/şube ataması ve temel işletme saatleri zaten vardır; gerçek DB yarış kabulü ayrı kapıdır.
- [x] Native müşteri bakım/onam durum kartı, randevu/yeni sadakat/teslimat geçmişi ve mevcut özel görseller; 036 canlı kuruldu. İletişim göndermez, hukuki onam oluşturmaz; staff scope/mali redaksiyon korunur.
- [ ] Native yeni özel before/after bakım görseli yükleme ve gerçek iletişim provider'ı/teslimat kabulü. Tekrarlanan/grup/çok hizmetli native işletme randevuları da ayrı kapsamdır.
- [x] Paket/seans defteri, yeni tanımlama snapshot'ı ve atomik tanımlama; 034 canlı kuruldu. Eski kullanım/fiyat/tahsilat tahmin edilmez, tek tamamlama makbuzu seans ve sadakat tekrarını önler. Gerçek DB yarış kabulü ayrı kapıdır.
- [x] Açık işletme seçimiyle atomik kampanya/kupon şartı düzenleme, CAS ve tekrar kimliği; 035 canlı kuruldu. Kullanılmış koşullar kilitlidir. Native ayrıntılı rapor grafikleri/033 zaten vardır; gerçek hesap kabulü ayrıca bekler.
- [ ] Fiziksel iOS/Android cihaz kabul testi; mağaza imzalama, gerçek production HTTPS API adresi ve yayın hesapları.

Bu değişiklik bütün web sayfalarının pixel-perfect taşınması veya App Store/Play Store yayın onayı anlamına gelmez. Native ekranlar aynı Supabase veritabanını kullanır; sahte işletme/kimlik verisi eklenmez. Kontrollü E2E fixture verileri sadece test ortamına aittir.

Kaynak kurulum sınırları: 029 tenant/servis-şube/açık rezervasyon zaman uyuşmazlığı ve fazla kapasitede veri silmeden durur. Yeni erteleme tetikleyicisi mevcut birim grafiği aynıysa rezervasyonları taşır; farklıysa yönetici incelemesi ister ve eski kayıtlar korunur. Fiziksel kaynak silme/cascade engellenir, aktiflik yönetimi kullanılır. Oluşturma UUID'si mevcut içerikle karşılaştırılır; sonraki değişiklikler için kalıcı replay garantisi değildir. Seri SQL motor testi 8/8 geçti; gerçek DB yarış/staging kapasite kabulü yapılmadı.

## Yeniden doğrulama

14 Ekim son kaynak kapısı: **184/184 mobil E2E** (182 kontrollü + 2 salt-okunur Gogo), hata/skip/retry yok; 700 birim/yetki ve 427 izole SQL kontrolü geçti. Web 49 başarılı/9 platform atlaması. Tip, tam lint, güvenlik, Next.js production build ve ayrı Android/iOS Hermes + web export başarılı. Kampanya UUID doğrulaması ve işletme/şube değişiminde router reseti düzeltildi; aynı-kapsam bakım taslağı ve orijinal CAS snapshot'ı arka plan yenilemesinde korunur. [034–037 canlı kabulü ve açık sınırlar](native-advanced-completion.md).

11 Ekim rapor kapısı: 521 birim/yetki testi, 61 rapor PostgreSQL/WASM kontrolü ve temiz preview üzerinde **145/145 mobil E2E** (143 kontrollü + 2 public Gogo) geçti; skip/retry yok. 7/30/90 tam gün, ayrı para birimleri, üç sayfalı kırılım ve gelecek yedi gün personel planı native ekranda eklendi. 033 onayla canlı kuruldu; 8 katalog/yetki/kaynak + geçmiş kaynak eşleşmesi + yedi tablo kayıt sayısı koruma kapısı **10/10** geçti. Web/mobil tip, lint, güvenlik, Next.js build ve ayrı dizinde Android/iOS Hermes + web export başarılı. Yeni native özellikler bu sabit export'un testleri olarak sayılmaz. [Rapor tanımları](business-reports.md).

11 Ekim son kod kapısı: 484 birim/yetki testi, ileri vardiya 29 ve kupon 32 izole PostgreSQL/WASM kontrolü başarılı. Güncel temiz preview export üzerinde **125/125 mobil E2E** (123 kontrollü, 2 salt-okunur gerçek Gogo görsel) retry olmadan geçti. 16 ileri vardiya, 5 müşteri kuponu senaryosu dahil; süre dolan bekleme aralığı testindeki alan değerleri açıkça doğrulandı ve tam koşu yeniden yapıldı. Web/mobil tip, tam lint, güvenlik kapısı, Next.js production build, güncel Android/iOS Hermes + web export başarılı. Ardından 031/032 canlı kuruldu; 20/20 kurulum/yetki, 14/14 fonksiyon/geçmiş kaynak eşleşmesi geçti. Native kaynak değişmediği için bu E2E/build kayıtları yeniden koşulmuş sayılmaz; gerçek test müşteri/randevu/kuponu yazılmadı.

11 Ekim canlı kapısı: kullanıcı onayıyla 028/029 ve varsayılan yetkileri kapatan 030 kuruldu. İki özellik güncellemesi editöre aktarılırken repo + geçmiş kaydı eşleşmesi, sonrasında 11/11 canlı fonksiyon gövdesi eşleşmesi doğrulandı. `native_operations_deployment_verify.sql` 12/12 geçti: 14 işlev ACL, dokuz FK, dört tetikleyici, beş RLS tablosu ve kapalı tablo/kolon/bakım/defter hakları. İzole geçici tablo SQL motor testi 8/8, tüm nesneler rollback; dört yeni ACL regresyonuyla 267 birim testi geçti. Anonim RPC/tablo ve oturumsuz API erişimi 401, public iki işletmeli dizin 200. Gerçek müşteri/randevu/kaynak test yazımı yapılmadı; gerçek yetkili hesapla yazma, JWT/RLS, yarış/staging ve fiziksel cihaz kapıları açık kalır.

10 Ekim önceki kod kapısı: **263 birim/yetki testi + 104/104 mobil E2E** (102 kontrollü + 2 salt-okunur canlı görsel), retry yok. Bekleme listesi 14 ve kaynak 9 yeni senaryo dahil; web/mobil tip, lint, güvenlik regresyon kapısı, Next.js production build ve Android/iOS Hermes + web export geçti. Bu mobil koşu 11 Ekim'de tekrar edilmedi; native kaynak değişmedi.

`pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm mobile:typecheck`, `pnpm test:security`, `pnpm build`.

Yerel optimize önizleme: `pnpm mobile:export:preview` ardından `pnpm mobile:preview` (8082). Backend 3001'de çalışmalı. Bu export içine localhost yazılır; mağaza paketinde kullanılmaz. Geliştirme için `pnpm mobile:start --web --port 8082` kullanılır; iki sunucu aynı portta birlikte başlatılmaz.

`pnpm mobile:test:e2e` ortak akışları test eder. `MOBILE_LIVE_VISUAL=1` ile salt-okunur canlı görsel testi gerçek public işletmeleri kullanır. İmzalı APK/IPA yerine Hermes JavaScript export kontrolü ayrı bir build doğrulamasıdır.

Son turun doğrulaması (7 Ekim): 103 birim/yetki testi ve 64 mobil E2E senaryosu geçti (62 kontrollü akış + 2 salt-okunur canlı görsel). Auth/form senaryoları ayrıca 15/15, sekme kaydırması 5/5 tekrarda geçti; retry kullanılmadı. Next.js production build, web/mobil TypeScript, lint, güvenlik regresyon kapısı, Expo Doctor 21/21 ve Android/iOS Hermes export başarılı. Yeni işletme API'leri oturumsuz erişimi 401 ile reddetti. Gerçek çalışan/işletme/randevu kaydına test yazımı yapılmadı. Gerçek yetkili hesapla yazma kabulü, fiziksel cihaz ve mağaza kapıları hâlâ gereklidir.

10 Ekim ek doğrulama: 159 birim/yetki/preview-routing testi, web ve mobil TypeScript, lint, Next.js 16.3.8 production build ve Android/iOS Hermes + web export geçti. Next.js'in altı yeni advisory'si uyumlu 16.3.8 patch sürümüyle kapatıldı; yerel transitive yamaların davranış testleri korunarak güvenlik kapısı `unresolved: []` verdi (ham dependency audit sıfır anlamına gelmez). Müşteri adına randevu 9/9, paket 8/8, kampanya 5/5 hedefli E2E geçti; giriş 9/9 ve kampanya oluşturma 5/5 tekrar kontrolünden geçti. Canlı şemada iki migration, üç doğrulanmış tenant FK, dört yönetici paket politikası, kapalı anonim RPC/özel defter ve seans kilidi doğrulandı. Geçerli biçimdeki oturumsuz yeni API çağrıları 401 ile reddedildi. Gerçek müşteri/randevuya yazma ve canlı eşzamanlı DB kapasite testleri yapılmadı; fiziksel cihaz/mağaza kabulü hâlâ gereklidir.

Son temiz export üzerindeki tam mobil regresyon: **81/81 geçti** (79 kontrollü + 2 salt-okunur gerçek Gogo ana sayfa/harita kabulü), retry kullanılmadı. Uygulanan SQL iki repo migration'ıyla, yalnız yorum/boşluk ve migration-geçmişi kayıtları hariç birebir karşılaştırılıp doğrulandı. Anonim Supabase RPC çağrısı da 401 ile reddedildi. İlk turda çıkan preview hydration ve görünmeyen form alanı test sorunları giderilerek tüm tur yeniden çalıştırıldı.

MapLibre Native [Expo Go içinde çalışmaz](https://maplibre.org/maplibre-react-native/docs/setup/expo/); `eas build --profile development` veya `preview` ile özel native build gerekir. Hermes export imzalı APK/IPA değildir. [OSM tile kullanım politikası](https://operations.osmfoundation.org/policies/tiles/) doğrultusunda atıf korunur, native istemci uygulama User-Agent'i gönderir, ön indirme/offline harita yapılmaz.
