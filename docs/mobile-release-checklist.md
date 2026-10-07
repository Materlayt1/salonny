# Salonny mobil yayın kontrol listesi

Bu belge `apps/mobile` altındaki Expo/React Native uygulamasının Google Play ve App Store sürüm kapısıdır. Mobil uygulama web uygulamasıyla aynı Supabase projesini, RLS politikalarını ve Next.js API katmanını kullanır. Ödeme bu sürümde yoktur; randevular işletmede ödeme modeliyle çalışır.

## Kod ve güvenlik kapısı

- [x] Müşteri ana sayfası, yatay vitrinler ve sayfalı/filtreli tüm işletmeler listesi native olarak hazır.
- [x] Gerçek marka logosu, pastel kategori ikonları, yatay vitrin kartları ve webdeki beşli alt menü düzeni native ekrana taşındı.
- [x] İşletme paneli dış tarayıcıdan native `/manage/[section]` ekranlarına taşındı; işletme/şube seçimi, randevu durumu, temel kayıt düzenleme, stok ve ayarlar ortak yetki kontrollü API'ye bağlandı.
- [ ] Web ile kalan ekran/özellik eşleşmesini [native-interface-parity.md](native-interface-parity.md) listesinden tamamla; tüm sayfalar henüz pixel-perfect değil.
- [x] Keşfet, işletme detayı, hizmet/çalışan/tarih/saat seçimi ve rezervasyon akışı hazır.
- [x] Native harita, açık rızayla yaklaşık konum, veritabanında sayfalama öncesi fiyat/yakınlık sıralaması ve hizmet araması eklendi; RLS korunuyor.
- [x] Gerçek hizmet/onaylı yorum vitrinleri ve ortak kaynaklı native yasal metin okuyucusu eklendi.
- [x] Çalışan hizmet yetkinlikleri, haftalık şube vardiyası ve izin/blok kayıtları native olarak yönetilir; sahiplik/rol kontrolleri, İstanbul saat dönüşümü, ileri vardiyaları koruma ve hata geri bildirimi vardır.
- [x] Native profil/mevcut adres/haftalık işletme saatleri ve temel kampanya editörü eklendi; kapsam sınırları native eşleşme listesinde kayıtlıdır. Gerçek işletme kaydı test amacıyla değiştirilmedi.
- [x] Filtre paneli, sabit keşif araması, dört adımlı sabit özetli randevu, büyük dokunma hedefleri, alan bazlı form geri bildirimi ve tam ekran gerçek fotoğraf galerisi eklendi.
- [x] Favoriler, randevular, profil ve uygulama içi hesap silme talebi hazır.
- [x] Randevu iptal/değişiklik, tamamlanan randevuya yorum, kişisel bilgi düzenleme ve bildirimleri okuma/okundu işaretleme native ekranlara eklendi.
- [x] Mobil Supabase public yapılandırması API'den alınabiliyor; giriş/yenileme/çıkış için sınırlı ve TLS doğrulamalı ortak geçit var.
- [x] Web önizlemede çalışmayan Alert geri bildirimleri düzeltildi; kayıt/giriş, şifre gösterme, şifre yenileme ve e-posta tekrar gönderme akışları var.
- [x] İşletme listeleri sanallaştırılıyor, arama 300 ms geciktiriliyor, tarih/saatler İstanbul saat diliminde gösteriliyor; aynı rezervasyon denemesinde işlem anahtarı korunuyor.
- [x] 62 kontrollü mobil akış + 2 salt-okunur canlı public görsel senaryosu (64 toplam) ve 103 birim/yetki testi geçti. Form odağı 15/15 ve sekme kaydırması 5/5 tekrar ile doğrulandı. Gerçek Supabase kimlik servisine erişim/hatalı parola yanıtı önceki turda kontrol edildi; bu turda gerçek hesapla yazma kabulü yapılmadı.
- [x] Mobil oturumlar işletim sistemi SecureStore alanında parçalı ve kalıcı saklanıyor.
- [x] Next.js API rotaları web cookie oturumuna ek olarak doğrulanmış Bearer token kabul ediyor.
- [x] Servis rolü anahtarı mobil pakete konmuyor; tenant sınırları Supabase RLS ve API yetkilendirmesiyle korunuyor.
- [x] API isteklerinde zaman aşımı, kontrollü hata mesajı, query cache/retry ve rezervasyonda idempotency anahtarı var.
- [x] Development CORS yalnızca bilinen Expo origin'lerine açık; production web origin'leri `MOBILE_ALLOWED_ORIGINS` ile açıkça tanımlanıyor.
- [x] `expo-doctor` 21/21 kontrolü geçti; TypeScript, Android/iOS Hermes paketleri ve static web export doğrulandı.
- [ ] Fiziksel iPhone ve Android cihazda düşük ağ, çevrimdışı/geçiş, deep-link ve klavye testlerini tamamla.
- [ ] MapLibre için Expo Go yerine özel development/preview build üret; native harita, foreground izin reddi, konumu kapatma ve pin seçimini fiziksel cihazda doğrula.
- [ ] Yüksek trafik için tile sağlayıcısını/kapasitesini belirle; `EXPO_PUBLIC_MAP_TILE_URL` HTTPS public istemci adresini tanımla. Public OSM tile sunucusunu sınırsız production altyapısı sayma.
- [ ] Ayrı müşteri, işletme ve admin hesaplarıyla RLS/IDOR mobil penetrasyon testini kayda al.

## EAS ve mağaza hazırlığı

7 Ekim: kullanıcı Expo/EAS, Apple Developer ve Play Console hesaplarının henüz hazır olmadığını belirtti; bu tur yalnız kod/test çalışmasıdır. İmzalı APK/IPA, mağaza gönderimi veya fiziksel kabul tamamlandı sayılmaz. [Cihaz kabul planı](mobile-device-acceptance.md) henüz uygulanmamış senaryoları kaydeder.

- [ ] Expo hesabında projeyi oluştur ve oluşan `extra.eas.projectId` değerini `app.json` içine ekle.
- [ ] EAS ortamına `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SUPABASE_URL` ve `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` ekle.
- [ ] Apple Developer ve Google Play Console hesaplarında `com.salonny.app` kimliğini ayır.
- [ ] Production API, gizlilik politikası, kullanım şartları ve hesap silme URL'lerinin herkese açık HTTPS adreslerini doğrula.
- [ ] Supabase Auth Redirect URLs listesine production `/auth/reset-password` adresini ekle; doğrulama/kurtarma e-postasını gerçek posta kutusuyla kabul testinden geçir.
- [ ] Apple/Google imzalama kimliklerini EAS Credentials ile oluştur veya güvenli kasadan bağla.
- [ ] `eas build --profile preview --platform all` ile iç dağıtım paketlerini üret ve cihaz kabul testini tamamla.
- [x] Foreground konum izni yalnız kullanıcının konum düğmesinden açıklama/onay sonrası istenir; arka plan konum izinleri kapalıdır. Gelecekteki kamera/bildirim izinlerini de yalnız gerekli anda iste.
- [ ] App Store privacy nutrition label ve Play Data Safety yanıtlarını gerçek veri akışına göre doldur.
- [ ] Yaş derecelendirmesi, destek URL'si, mağaza açıklaması, ekran görüntüleri ve 1024×1024 mağaza ikonunu tamamla.
- [ ] Apple inceleme hesabı ve notlarında işletmede ödeme yapıldığını açıkça belirt; gerçek kişisel veri kullanma.
- [ ] Internal Testing ve TestFlight'ta çökmesiz oturum, giriş, rezervasyon, iptal/değişiklik ve hesap silme senaryolarını geçir.
- [ ] Son onaydan sonra `eas submit --platform android` ve `eas submit --platform ios` çalıştır.

## İzleme ve kontrollü açılış

- [ ] Mobil sürüm numarasıyla eşleşen crash/error reporting sürümünü aç; kaynak haritalarını özel olarak yükle.
- [ ] API 5xx, auth hatası, rezervasyon çakışması, p95 gecikme ve rate-limit kesintisi alarmlarını mobil sürüm etiketiyle izle.
- [ ] Android'i önce internal/closed track, iOS'u TestFlight grubunda yayınla; küçük kullanıcı grubundan sonra kademeli aç.
- [ ] Readiness ucu veya rezervasyon doğruluğu bozulursa mağaza rollout'unu durdur; backend için geri alma/ileri düzeltme runbook'unu uygula.

Mağaza hesabı, hukuki beyanlar, imzalama sertifikaları ve production HTTPS adresleri dış bağımlılıktır. Bunlar tamamlanmadan “mağazada yayınlandı” kabul edilmez; kodun yerel olarak derlenmesi tek başına yayın onayı değildir.
