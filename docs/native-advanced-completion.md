# Native ileri panel: son tamamlama ve kabul

14 Ekim 2026. Mobil önceliklidir; ekranlar native React Native/Expo bileşenleridir, WebView veya dış web paneli değildir. Web ve mobil aynı Supabase veritabanını ve yetki kontrollü API'yi kullanır. Ödeme eklenmedi.

## Eklenenler

- Paket/seans defteri: Operasyonlar → Paketler ve seanslar. Yeni tanımlamada değişmez başlangıç snapshot'ı, atomik tanımlama ve seans hareketleri vardır. Aynı tamamlanan randevuyu yeniden açıp tamamlamak tekrar seans veya +10 sadakat puanı işletmez. Eski kullanım ve tahsilat tahmin edilmez; bilinmeyen değerler açıkça belirtilir.
- Kampanyalar: Pazarlama. Seçili işletmede oluşturma, kod/indirim/tarih/segment düzenleme ve sürüm kontrollü durum değişimi vardır. Kullanılmış kuponun koşulları kilitlenir; yalnız isim/durum değiştirilebilir. Sabit indirim hizmetin para birimindedir; kur dönüşümü yapılmaz. Belirsiz sonuçta aynı işlem kimliği korunur.
- Müşteri bakım kartı: Müşteriler → Müşteri bakım ve geçmişi. Bakım/onam durum kaydı, randevu geçmişi, yeni sadakat hareketleri, iletişim teslimat bilgisi ve mevcut özel görseller gösterilir. Çalışan erişimi izin/atanmış müşteri kapsamına bağlıdır; finansal alanlar izne göre gizlenir. Her geçmiş sayfası 25 kayıttır. Müşteri dizini de tam yetkili kapsam üzerinden 25 kayıt ve tam sayımla gelir; ilk 1000/5000 randevudan müşteri listesi türetilmez.
- İşletme kurulumu: Profil → İşletme kurulumu veya panel Ayarlar → İşletme kurulumu, konum ve görseller. Kategori/iletişim, şube adresi ve harita pini, kapak/galeri, eksik adım kontrolü ve sahibin incelemeye gönderimi native'dir. İlk sahip olunan taslağa devam edilir; ilave işletme oluşturma ayrı kapsamdır. Profil/görseller işletme genelinde, konum seçili şubededir. İncelemeye göndermek otomatik yayın değildir.

Yeni işletme fotoğrafı yalnız açık kullanıcı seçimi ve “yayınla” işlemiyle yüklenir. Native'de küçültülür, sunucuda boyut/kare/piksel sınırlarıyla yeniden kodlanır ve EXIF/GPS kaldırılır. Fotoğraflar public işletme bucket'ındadır: işletme taslak olsa da fotoğraf URL'si özel saklama değildir. Storage ile SQL tek dağıtık transaction değildir; sonuç belirsizse aynı UUID/aynı baytlar karşılaştırılarak tekrar denenir, bilinmeyen nesne ezilmez/silinmez. Bağlanmamış nesnelerin operasyonel saklama/temizlik politikası ayrıca gerekir.

Bakım onamı yalnız işletmenin tuttuğu durum kaydıdır; hukuki onam/e-imza oluşturmaz. Sadakat defteri yalnız kurulum sonrası değişiklikleri izler, geçmiş kazanımı uydurmaz. İletişim ekranı mesaj göndermez; mesaj içeriği/alıcı/sağlayıcı çıktısını taşımaz. Native bakım görselleri mevcut özel kayıtların salt-okunur görünümüdür; yeni before/after yüklemesi bu paket içinde yoktur. Webde müşteri iletişim düzenlemesi ve bakım kaydı ayrı işlemlerdir; bütün CRM formu tek atomik işlem değildir. Bakım formunun kendi kapatma düğmesinde taslak bırakma onayı vardır; donanımsal geri/üst menüyle bölüm değiştirmede genel kaydedilmemiş-taslak koruması ayrı açık UX/cihaz kabulüdür.

## Canlı kurulum — tamamlandı

Kullanıcının açık 034–037 onayıyla 13 Ekim'de dört kaynak ve migration geçmişi **tek korumalı transaction'da** kuruldu. Tutarsız eski veriyi silen/otomatik onaran işlem yoktur.

- 52/52 salt-okunur katalog, ACL, kaynak, indeks, Storage ve veri koruma kontrolü geçti.
- Dört tam migration-geçmiş kaynağı repo ile eşleşti.
- Mevcut 15 tablonun kayıt sayıları değişmedi. Yeni paket tamamlama/seans ve sadakat defterlerine geçmiş veri eklenmedi.
- Test müşterisi, randevu, paket tanımı, kupon kullanımı, SMS veya ödeme yazılmadı.

Tam kaynak MD5'leri (kimlik doğrulama/imza değil, kaynak eşleşmesi):

| Güncelleme | MD5 |
| --- | --- |
| 034 | 1c8f7d0374d46465cc570c08b4e0b9aa |
| 035 | f9837980e2dfed2d57501bc58d6c6f86 |
| 036 | fe5932d8b3733f804ea16e2a6ab8c8fa |
| 037 | 6be94706cc9d7a17bf5ada6347577ae0 |

Kurulum öncesi/sonrası: randevu 6, randevu kalemi 6, müşteri 2, çalışan 2, vardiya 0, indirim 1, kupon kullanımı 1, paket şablonu 0, müşteri paketi 0, kampanya 1, bakım profili 0, bakım görseli 0, sadakat hesabı 1, işletme görseli 3, konum 2. Mevcut kupon kullanımı bu testlerin oluşturduğu bir kayıt değildir.

## Kod doğrulaması

13 Ekim: 697 birim/yetki testi, 031–037 için toplam 427 izole PostgreSQL/WASM kontrolü geçti. SQL kontrolleri artık repo bağımlılığı ve `pnpm test:sql` ile tekrar üretilebilir; CI'a eklendi. Tip, lint ve güvenlik kapısı geçti. Bu sonuçlar gerçek DB eşzamanlı trafik veya fiziksel cihaz kabulü değildir.

14 Ekim son doğrulama:

- 700/700 birim/yetki testi, 427/427 izole SQL kontrolü.
- Temiz preview `entry-29a09f51c3ddbe4b87ae1b3065d349fd.js` üzerinde **184/184 mobil E2E**: 182 kontrollü + 2 salt-okunur gerçek Gogo ana sayfa/harita. Hata, skip veya retry yok; süre 6,7 dakika. Son dört özelliğin 52 hedef testi de ayrı temiz koşularda geçti (25 kampanya/paket + 15 kurulum + 12 bakım).
- Web **49 başarılı / 9 platforma özel atlama**, hata/retry yok. Bir projenin zaten diğer projede kapsanan testleri tekrar sayılmaz.
- Web/mobil tip kontrolü, tam lint ve bağımlılık güvenlik kapısı geçti; unresolved advisory yok. Next.js production build başarılı.
- Ayrı `artifacts/mobile-advanced-release-20261014` dizininde Android/iOS Hermes ve web export başarılı. Bu çıktı imzalı APK/IPA veya mağaza kabulü değildir; production API/EAS yapılandırması ayrı kapıdır.
- Oturumsuz geçerli kapsamla dört yeni/yenilenen korumalı API 401. Yerel readiness DB `ok`, public dizin iki gerçek işletme. Redis yalnız development'ta optional olduğundan bu production readiness kabulü değildir.

Son backend kontrolü, zaten 50 görsele ulaşmış galeriye yeni nesneyi Storage'a göndermeden reddeder; sayım servisi hata verirse boş kapasite uydurmaz. SQL limiti eşzamanlı yazımda da korur. Storage/SQL yarışındaki olası bağlanmamış nesne ve operasyonel temizlik sınırı yukarıdaki gibi devam eder. Native kaynak bu backend-only kontrolde değişmedi.

13 Ekim soğuk development yük smoke'u: 40 istek / 5 eşzamanlı, 40 HTTP 200, p95 3429 ms, 7,37 istek/sn; 2500 ms / 20 istek/sn eşikleri geçmedi. Geçici DB ulaşamama sonrası gerçek public DB okuması ve readiness tekrar başarılıydı. Bu development/cache ağırlıklı smoke production trafik kapasitesi veya işlem doğruluğu kanıtı değildir; yüksek trafik GO kapısı açık kalır.

## Kullanıcının son kontrolü

- Kendi hesabıyla mobil giriş; işletme/şube değiştirince bulunduğu bölümde kalma ve doğru kayıtların görünmesi.
- Pazarlama, paket/seans defteri, müşteri bakım geçmişi ve kurulum ekranlarını kendi yetkileriyle açma. Gerçek kayda yazmadan önce içerik/onay özeti kontrolü.
- Fiziksel iOS/Android'de klavye, geri/swipe, düşük ağ, dosya seçici, harita ve izin reddi.
- EAS/Apple Developer/Play Console, imzalı paketler, TestFlight/Internal Testing ve production HTTPS API yapılandırması.

Gerçek staging JWT/RLS yazımı, yarış/yük/kota, production Redis, yedek/geri yükleme ve alarm kabulü hâlâ gereklidir. Eski web SSR raporunun tam agregasyon motoruna taşınması da ayrı açık iştir. Bu paket bütün web ekranlarının pixel-perfect eşleşmesi, mağaza yayını veya binlerce eşzamanlı kullanıcı için GO değildir.
