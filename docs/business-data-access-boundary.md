# İşletme verisi erişim sınırı — 040/041

Bu belge tek başına genel yayın onayı değildir. 040/041, kullanıcı onayıyla 17 Ekim'de iki aşamada canlıya kuruldu. Önce 040, sonra `035d978` web/native API Netlify yayını doğrulandı; ardından 041 kuruldu. 14 katalog/ACL kontrolü, altı kanonik işlev gövdesi ve iki migration geçmişi eşleşti. İşletme/müşteri/randevu/bildirim/ödeme/booking-request sayıları 2/2/8/17/0/0 olarak değişmedi. Uygulama bu yeni katmanı kullanmaya başladıktan sonra eski, geniş okuma yolu yedek olarak açılmaz.

## Dağıtım sırası zorunludur

1. Onay sonrası Supabase `inkybypxpqqoajufhdol` üzerinde 040'ı kur: üç salt-okunur görünüm, üç sorgu indeksi ve seçili işletmeli müşteri aktarımı. Mevcut kayıtlar değişmez.
2. 040 katalog ve ACL'lerini doğrula; sonra uygulama commit'ini GitHub/Netlify'a yayımla. Web SSR ve native ortak API'sinin yeni görünümleri gerçekten kullandığını doğrula. **040 kurulmadan bu uygulama adayını yayımlama.**
3. Yeni dağıtım doğrulanınca 041'i kur. Eski kaynakla çalışan sunucuya önce kısıtlı ham tablo yetkileri uygulanmaz.
4. `supabase/tests/private_business_access_deployment_verify.sql`, saklanan işlev gövdeleri ve migration kaynak geçmişini kanonik dosyalarla karşılaştır. Kayıt sayıları ve hiçbir gerçek test randevusu/ödeme/SMS oluşturulmadığını kontrol et.
5. Ayrı gerçek sahip, yönetici, kısıtlı çalışan ve müşteri JWT hesaplarıyla PostgREST/API/SSR kabulü yap. Yerel `SET ROLE` testi gerçek JWT kabulü değildir. Aşağıdaki testler yüksek trafik veya gerçek yazım yarışı kabulü yerine geçmez.

Kısıtlar `lock_timeout=5s`, `statement_timeout=60s` ile transaction içinde kurulur. Tutarsız eski tenant/kimlik/çalışan eşleşmesi kurulumun tamamını durdurur; otomatik veri düzeltmesi/silmesi yapılmaz. Büyük veritabanında indekslerin ayrı, eşzamanlı kurulum planı gerekebilir; bu dosyalar otomatik online-DDL garantisi vermez.

## Veri yolları

| Tüketici | Okuma yolu | Yetki sınırı |
| --- | --- | --- |
| Web/native dashboard, native randevular/takvim, web randevu/takvim | `business_calendar_appointments` | Aktif üyelik/şube; çalışan için tek aktif çalışan eşleşmesi + calendar izni + kendi ataması; iletişim ve para alanları SQL'de maskelenir. API ayrıca seçili işletme/şubeyi sınırlar. |
| Web/native stok | `business_inventory_access` | Stok okuma izni; fiyatlar finance izni yoksa SQL NULL. Çalışan web ekranı salt-okunurdur. |
| Dashboard işletme müşteri sayısı | `business_customer_totals` | Müşteri izni + `all` görünürlüğü; çalışan için tek aktif eşleşme. Yetkisiz/eksik satır sıfır diye gösterilmez. |
| Müşteri dizini/bakım ve raporlar | Mevcut 036/033 yetkili RPC'ler | Mevcut dar kapsam korunur; ham CRM tablosuna geri dönüş yoktur. |
| Müşterinin kendi randevu/kalem/makbuzu | Mevcut müşteri okuma yolu | Kendi müşteri UID'si; başka işletmenin CRM notlarını açmaz. |

Görünümler bilinçli olarak owner-rights ve `security_barrier=true` kullanır. Invoker görünümü ham tablodaki çalışan yasağını devralıp çalışan ekranını kapatırdı. Bunun karşılığında görünümlerin **tamamı**, filtre/aggregate/wildcard dahil, açık `auth.uid()`/rol/izin koşullarıyla güvenli olmak zorundadır. İstemciye yalnız SELECT verilir; varsayılan ALL grant'leri kaldırılır. Yeni görünüm ham not, müşteri UID/ID, işlem anahtarı veya yetkisiz fiyat içermez. Global yöneticinin mevcut ham yönetim erişimi korunur; görünümden yapay işletme üyeliği verilmez.

041 ham müşteri, randevu, kalem, makbuz, stok/hareket, aktarım işi ve konuşma/mesaj yollarına restrictive sınırlar getirir. Çalışanlara ham özel tablolar yeniden açılmaz; kendi müşteri makbuzu gibi mevcut müşteri hakkı ayrıdır. İstemci rolünün uygulama tablolarındaki gereksiz TRUNCATE/REFERENCES/TRIGGER bakım yetkileri ve eski kolon grant'leri de kapatılır. Bu bir kayıt silme işlemi değildir.

## Yazım ve kimlik

- Randevu durum RPC'si çalışan için calendar izni ve kendi atamasını veritabanında yeniden doğrular. Aynı durum tekrarı CRM toplamını/bildirimi ikinci kez üretmez; API de aynı durum tekrarına izin verir. Geçersiz geçiş yarışı 409, kaybolan yetki 403 olarak gösterilir.
- Stok hareket RPC'si sahip/yöneticiyle sınırlıdır; yabancı ürün ve geçersiz/negatif sonuç reddedilir. Dönüşü özel alış fiyatını içermez.
- Eski `bulk_import_customers(jsonb)` istemciye kapatılır. Yeni `import_business_customers(uuid,jsonb)` seçili işletmede aktif sahip/yönetici ister. JSON sınırları, yinelenen telefonlar ve kesin sonuç onayı kontrol edilir.
- Seri randevu sahip/yönetici ister; aktif şube/hizmet/uzman bağlantısı, güncel fiyat/süre/buffer ve gerçek uygun slot kontrolü yapılır. Sonraki slot başarısızsa seri tek transaction olarak geri alınır. Grup fiyatlandırma/kaynak birimi modeli ve kalıcı seri işlem anahtarı bu fazda yeniden tasarlanmış değildir; tek randevunun 026 replay sözleşmesiyle aynı iddia edilmez.
- Müşteri `id`/`business_id` değiştirilemez. Var olan hesapsız CRM satırını hesaba bağlamak için Auth `phone_confirmed_at` + doğrulanmış telefonun **eski ve yeni** telefonla normalize tam eşleşmesi gerekir. `public.users.phone` veya kullanıcı metadata'sı kanıt değildir. Mevcut bağlı kayıt başka hesaba atanamaz. Güvenilir `service_role` bakım istisnası istemciye verilmez.
- Yeni kendi müşteri kaydı ve zaten aynı hesaba bağlı kayıt devam eder. Eski hesapsız telefon çakışmasında doğrulanmamış kullanıcıya açık hata gösterilir; işletme müşteri adına randevu oluşturabilir. SMS sağlayıcısı/doğrulama akışı eklenmez, geçmiş kayıtlar kendiliğinden bağlanmaz. Bu koruma bütün yeni telefonların sahipliğini veya çoklu sahte hesap sorununu çözdüğü iddiası değildir.

## Kabul sınırları

`scripts/test-business-access-engine.mjs`, gerçek şema/politika tanımlarını izole PostgreSQL/WASM'a yükler ve superuser/BYPASSRLS olmayan `authenticated` rolüyle SELECT, wildcard, filtre, aggregate, kolon grant, mutation ve RPC sınırlarını sınar. Ek geniş permissive politikaya rağmen restrictive sınırın kazanması, eski veriyle kurulum rollback'i ve rol farkları test edilir. 038 motorunda da yeni kimlik guard'ı gerçek booking upsert'ine entegre edilerek hata halinde randevu/kalem/ledger/bildirim/audit rollback'i kontrol edilir.

Web SSR ve API testleri izin/şube/zaman dilimi, eksik toplam/hata, maskeleme, tam sayfalama, eski finans izni ile yeni SQL maskesi arasındaki yarış ve bozuk RPC onaylarını kontrol eder. Web randevu araması/hızlı düğmeleri sayfa içidir; üst durum filtresi tam veriye uygulanır. Takvim tarih sınırları DST'yi kullanır; stok listesi hâlâ ilk 1.000 kaydı açıkça belirtir, QA-14'ün tam sayfalama işi bitmiş sayılmaz.

Yeni native kabul senaryosu ilk çalışmada gerçek bir UX hatası yakaladı: her 409 yanıtı tarih adımına dönüyordu. Kimlik/kupon/işlem anahtarı hataları artık onay ve iletişim taslağını korur; yalnız gerçek uygunluk çakışması saati temizler. API uygunluk hatasına açık `slot_not_available` kodu ekler; eski kodsuz 409 sunucularına uyumluluk korunur. Bu senaryo düzeltilmeden önceki başarısız tam koşu başarılı sayılmaz.

Native web form odağının kaybolması da gerçek DOM kaydırma olayıyla yeniden üretildi: React Native Web `on-drag` ayarında programatik kaydırmada bile girdiyi blur ediyordu. Altı formda yalnız web için `keyboardDismissMode="none"` kullanılır; iOS/Android sürükleyerek kapatma davranışı korunur. Yeni regresyon eski bundle'da başarısız, yeni bundle'da başarılıdır. İlk tam koşudaki ana sayfa arama alanının boşalması için kök neden henüz kesinleşmedi; izole tekrarların geçmesi tek başına o sorunu kapatmaz.

Son yerel kanıt: bildirim cache/servis-hatası ek kontrolleriyle 1.012 birim/API testi; dokuz SQL motorunda 657 kontrol (170 erişim sınırı, 60 gerçek booking-policy entegrasyonu dahil); native temiz tam koşu 214 başarılı/2 isteğe bağlı canlı görsel atlaması. Bunlar farklı kapılardır, benzersiz senaryo sayısı gibi toplanmaz. Mevcut gerçek sahip cookie oturumuyla yeni web dashboard, 5 kayıtlı randevu listesi, 1 ürünlü stok ve randevulu günün takvimi 040 sonrasında okundu; takvim 041 sonrasında da geçti. Yerel native ve canlı native önizleme oturumsuzdu; token/hesap üretilmedi. Ayrı gerçek yönetici/kısıtlı çalışan/müşteri JWT kabulü hâlâ açıktır.

Son dağıtım: `f4c515e`, Netlify production `6ad354ab7999c4a220676276`. [Temiz CI](https://github.com/Materlayt1/salonny/actions/runs/39026874479) 1.012 birim/API, 657 SQL + ayrı 23 şehir kontrolü, lint/tip/dependency, production build ve iOS/Android/web export kapılarını geçti. Mobil 214 ilk-deneme başarısı/2 isteğe bağlı atlama; otomatik tekrar yok. Fiziksel cihaz/mağaza paketi üretildiği anlamına gelmez.

041 sonrası 41/41 canlı HTTP kontrolü: olumlu anonim PostgREST kontrolü 200 iken dokuz özel tablo ve üç özel görünüm 401/42501 ile reddedildi. Yeni native bundle/MIME, özel API cache yasağı, SSR giriş sınırı, CSRF, şehir/ASCII/boş şehir/GPS ve DB+Redis readiness geçti. Mevcut gerçek sahip cookie oturumuyla ortak dashboard/randevu/stok API'si de başarılıydı; randevu 5/5, stok 1/1 kayıt döndürdü. On kanonik işlev (altı yeni + dört korunmuş 038 kuralı), eski üç kural trigger'ı ve üç zaman-çakışma kısıtı doğrulandı. Bunlar başka çalışanların gerçek JWT kabulü veya yüksek eşzamanlı yazım testi değildir.

Temel tasarım dayanakları: [PostgreSQL RLS](https://www.postgresql.org/docs/current/ddl-rowsecurity.html), [PostgreSQL görünüm güvenliği](https://www.postgresql.org/docs/current/sql-createview.html), [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security). Bu belge tek başına güvenlik sertifikası veya kapasite kanıtı değildir.
