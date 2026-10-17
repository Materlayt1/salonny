# İşletme raporları: tanımlar ve kabul sınırları

11 Ekim 2026. Native rapor ekranı, web API üzerinden salt-okunur `native_business_report` motorunu kullanır. Mevcut web panelinin eski rapor sayfası bu turda aynı motora geçirilmedi; bu geçiş ayrı yapılacak iştir. `033_native_business_reports` açık kullanıcı onayıyla canlı kuruldu ve aşağıdaki salt-okunur kurulum kapısından geçti. Bu, gerçek kullanıcı/cihaz/yük kabulünün yerine geçmez.

## Kapsam ve dönem

- `GET /api/business-management/report-summary` doğrulanmış oturum, işletme üyeliği ve açık işletme/şube seçimi ister. Dönemler yalnız 7, 30 veya 90 gündür; kırılımlar 25 kayıtlık sayfalarla gelir. Mevcut `/api/business-management/reports` randevu listesi ayrı kalır.
- Son **N tam takvim günü**, işletmenin IANA saat dilimindeki bugün 00:00 sınırında biter; tamamlanmamış bugün rapora katılmaz. Önceki dönem, hemen önceki aynı uzunluktaki N gündür. Yaz/kış saati geçişinde N günün sabit `N × 24 saat` olduğu varsayılmaz.
- Gün, randevunun başlangıcının işletme yerel tarihidir. Randevu bir sonraki güne uzanıyorsa geçmiş dönem kaydı başlangıç gününde sayılır. Para birimi ve durum, mevcut randevu kaydındaki değerlerdir; geçmişteki durum değişimleri yeniden kurulmaz.
- “Seçili şube” tek şubeyi; “Tüm şubeler” yalnız aynı işletmenin bütün geçmiş şube kayıtlarını kapsar. Pasif şubelerin geçmiş randevuları tüm-şube raporunda kaybolmaz. Gelecek kapasitesi yalnız aktif şube/aktif uzmanların mevcut çalışma planından hesaplanır.
- Sahip ve yönetici kendi işletmesinin raporunu görür. Çalışan için hem `reports` hem mali görünürlük izni ve tek bir aktif uzman eşleşmesi gerekir; yalnız kendi uzman kimliğine bağlı randevular/kapasite görünür. Diğer işletme ya da yönetici rolü bu sınırı aşmak için kullanılamaz. Müşteri adı, telefon veya e-posta rapor payload'ına girmez.

## Metrikler

| Alan | Tanım |
| --- | --- |
| Randevular | Dönemde başlayan tüm `pending`, `confirmed`, `completed`, `cancelled`, `no_show` randevuları; her randevu bir kez. |
| Tamamlandı | Mevcut durumu `completed` olan randevu adedi. |
| İptal / gelmedi oranı | Sırasıyla `cancelled / total` ve `no_show / total`. Toplam sıfırsa oran hesaplanmaz. |
| Randevu süresi | `pending`, `confirmed`, `completed` kayıtlarının `ends_at − starts_at` dakika toplamı. Sistem tampon süresi bu aralıkta bulunabilir; hizmet süresi/tahsilat ya da tarihi doluluk oranı değildir. |
| Tamamlanan randevu tutarı | Yalnız `completed` randevuların kaydedilmiş `total_minor` değerlerinin kendi para birimleri içinde toplamı. İndirim sonrası randevu tutarıdır; tahsil edilmiş ödeme/ciro değildir. |
| Önceki dönem | Aynı uzunluktaki önceki takvim dönemi. Önceki değer sıfırsa yüzde değişim hesaplanmaz; sonsuzluk veya uydurma %100 artış gösterilmez. |

Tutarlar, JavaScript güvenli tam sayı sınırını aşabilen ondalıksız **minor birim dizeleri** olarak taşınır. TRY ve USD gibi farklı para birimleri birbiriyle toplanmaz, dönüştürülmez veya tek para değişim yüzdesine indirgenmez. Arayüz tam sayıyı yuvarlayarak kaybetmez. Servis kırılımında randevu tutarı hizmetlere keyfî paylaştırılmaz.

Günlük seri ve özet tüm dönem/kapsam üzerinden veritabanında hesaplanır; yüklenen ilk 25/50 randevu veya kırılım satırından toplam tahmin edilmez. Kırılım sayfası, özeti küçültmez. Her API yanıtı aynı okuma snapshot'ındaki özet, grafik ve kırılımı taşır. Birden fazla sayfa ayrı isteklerde alındığından arada değişen veriye karşı tek, kalıcı snapshot garantisi verilmez; yenileme yeni güncel raporu getirir.

## Hizmet, uzman ve şube kırılımları

Hizmet kırılımı, aynı hizmet randevuya birden fazla item satırıyla bağlansa da `(randevu, hizmet)` katılımını bir kez sayar. Çok hizmetli bir randevu birden fazla hizmete katılır; bu nedenle hizmet satırlarının toplamı genel randevu adedine eşit olmak zorunda değildir. Hizmet tutarı `null` olarak kalır: sepet indirimi/hizmet geliri dağıtımı yapılmaz.

Hizmet satırı bulunmayan eski randevu genel sayı/tutardan kaybolmaz, fakat hizmet katılımına bağlanamaz. Hizmet kırılımı bütün randevuların tam dağıtımı veya sepet içeriğinin tarihi yeniden kurulması değildir.

Uzman ve şube kırılımları randevu kayıtlarından hesaplanır; tamamlanan tutarlar para birimi bazında ayrılır. Üç kırılımın sayfa seçimi bağımsızdır. İkinci sayfa kullanıcı “Daha fazla …” düğmesine bastığında istenir; kapsam/dönem değişince eski satırlar yeni rapora eklenmez.

## Gelecek yedi gün planlanan doluluk

Bu alan geçmiş 7/30/90 günün doluluğu değildir. **Yarından başlayan yedi tam işletme-yerel günün mevcut planıdır**; bugün ve tamamlanmamış saatleri içermez.

1. Uzmanın o gün/şube için tarih aralığına uyan çalışma dönemleri varsa bunlar, yoksa işletme saatleri kullanılır. Çok parçalı/tarihli dönemler mevcut müsaitlik motorundaki ek dönem/fallback kurallarını izler.
2. Şube molaları ve uzman izinleri çıkarılır. Aynı uzmanın çakışan dönemleri/çoklu şube saatleri birleştirilir; uzman kapasitesi iki kez sayılmaz.
3. `pending` ve `confirmed` gelecek randevu aralıkları pencereye kırpılıp birleştirilir. Çakışan iki rezervasyon aynı uzman dakikasını iki kez doldurmaz. Seçili şubedeki uzmanı başka şubeye atanmış randevu da aynı dakikada bloke eder; “plan dışı” uyarısı ise yalnız seçili rapor kapsamındaki randevuları sayar.
4. Doluluk, plan içindeki dolu uzman-dakikası / mevcut uzman-dakikasıdır. Kapasite sıfırsa oran hesaplanmaz. Plan dışında kalan rezervasyon dakikaları ayrı uyarıdır; yüzdeye eklenip %100'ü aşan bir doluluk üretilmez.

Pasif/bağlantısı kaldırılmış uzmanda varlığını sürdüren gelecek randevular kaybolmaz; plan dışında görünür. Bu, oda/cihaz/koltuk kapasite garantisi veya yeni randevu için müsaitlik teklifi değildir. Randevu oluşturma hâlâ gerçek rezervasyon motorunun eşzamanlı kontrollerini gerektirir.

## Hata ve güvenlik davranışı

Eksik 033, yetki/tenant problemi, tutarsız eski veri veya okunamayan rapor başarılı “sıfır veri” sayılmaz. Yüklenirken özet uydurulmaz; hata ve açık yeniden yükleme sunulur. Gerçekten boş ve kabul edilmiş yanıt ayrı durumdur.

API ve native istemci payload'ın kapsamını, tam günlük serisini, toplamlarını, para birimi/minor biçimini, kırılım sayfasını ve plan oranını doğrular. İşletme/şube/dönem/oturum anahtarları değiştiğinde eski yanıt yeni seçime gösterilmez. HTTP yanıtı `private, no-store` olur; anonime doğrudan rapor RPC yetkisi verilmez. Motor yalnız aggregate okur; müşteri/randevu/ödeme/kupon yazmaz.

## Doğrulama kaydı

Kontrollü native senaryolar `e2e-mobile/business-reports.spec.ts` dosyasındadır. Sahte kimlik/oturum ve API fixture'ları kullanılır; gerçek Supabase ağı engellenir, ilgisiz yazım ve rapor mutasyonu yakalanır. Bu testler UI, kapsam değişimi, sayfalama, hata ve tutar sunumunu doğrular; gerçek JWT/RLS, canlı veritabanı yetkileri, ağ yarışı ve binlerce trafik kapasitesi kabulünün yerine geçmez.

11 Ekim son hedefli native koşu: ikinci temiz web export'u `entry-3c979b2cbd0bc2872579ab0b936deda0.js` üzerinde **20/20 geçti** (53,9 saniye, retry yok). 7/30/90 gün, tüm şubeler, üç kırılımın bağımsız sayfalaması, sayfalar arası değişmiş toplam uyarısı, plan dışı doluluk, çoklu para birimi ve güvenli sayı sınırının üstündeki tutarlar, gerçek sıfır payda, yükleme/503/yeniden deneme, bozuk tutar/kapsam/günlük seri/dakika yanıtını reddetme, geç dönen eski şube yanıtı, işletme/izin/oturum değişimi, çalışan kapsamı ve 320/390 piksel grafik/typografi sınandı. Oturum testi gerçek hesaba giriş yapmaz: aynı fixture hesabında çıkış ve yeni fixture bearer ile client-side giriş, eski raporu yeniden kullanmadan tamamlandı. Hedefli ESLint geçti.

SQL motorunun izole PGlite fixture'ında **61/61** kontrol geçti; sekizi kurulum/yetki/fonksiyon kaynağı denetimidir ve gerçek RPC yanıtları ortak strict sözleşmeyle doğrulanır. Yabancı şube/işletme kaynaklı tutarsız gelecek randevusu, diğer şubedeki aynı uzmanın meşgul süresi, kapasite birleştirme, izin/mola/DST, tam dönem ve para birimi ayrımı sınanır. Bu koşu gerçek canlı PostgreSQL/JWT/RLS/yük testi değildir.

`artifacts/mobile-native-business-reports.jpg` ve `artifacts/mobile-native-business-reports-chart.jpg` yalnız bu kontrollü fixture'ın görünüm kanıtlarıdır; gerçek müşteri kişisel verisi içermez, yayınlanmış/demo işletme verisi oluşturmaz.

Ardından aynı temiz `entry-3c979b2cbd0bc2872579ab0b936deda0.js` export'unda **tam mobil regresyon 145/145 geçti** (6,7 dakika; skip/retry yok). 143 kontrollü akışa ek olarak gerçek public Gogo verisiyle ana sayfa ve harita salt-okunur kontrolleri geçti. Sonraki native özelliklerin kaynak değişiklikleri bu export'un kabulü olarak sayılmaz; yeni export/kabul gerektirir.

Canlı 033 kapısı **10/10 geçti**: sekiz katalog/ACL/fonksiyon kaynağı denetimi, tam migration-geçmiş kaynağı eşleşmesi ve yedi mevcut tablo için kayıt sayısının değişmediği kapı. Native oturumsuz erişim engeli tarayıcıda görüldü. Kullanıcının kendi gerçek yetkili hesabıyla native raporu salt-okunur açması henüz bekler; gerçek JWT/RLS sonucu bu izole oturum senaryolarından çıkarılmaz. Bu çalışma gerçek müşteri, randevu, kupon kullanımı, SMS veya ödeme test yazımı yapmadı; daha önce var olan kayıtlar geçmiş sayılmaz veya yeniden oluşturulmaz.

Gerçek salt-okunur yetkili API kabulü, fiziksel iOS/Android ve production yük/alarm/yedekleme kapıları ayrıca kaydedilmelidir. Bu rapor özelliği tek başına genel production GO değildir.
