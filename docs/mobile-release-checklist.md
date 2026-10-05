# Salonny mobil yayın kontrol listesi

Bu belge `apps/mobile` altındaki Expo/React Native uygulamasının Google Play ve App Store sürüm kapısıdır. Mobil uygulama web uygulamasıyla aynı Supabase projesini, RLS politikalarını ve Next.js API katmanını kullanır. Ödeme bu sürümde yoktur; randevular işletmede ödeme modeliyle çalışır.

## Kod ve güvenlik kapısı

- [x] Müşteri ana sayfası, yatay vitrinler ve sayfalı/filtreli tüm işletmeler listesi native olarak hazır.
- [x] Keşfet, işletme detayı, hizmet/çalışan/tarih/saat seçimi ve rezervasyon akışı hazır.
- [x] Favoriler, randevular, profil ve uygulama içi hesap silme talebi hazır.
- [x] Randevu iptal/değişiklik, tamamlanan randevuya yorum, kişisel bilgi düzenleme ve bildirimleri okuma/okundu işaretleme native ekranlara eklendi.
- [x] Mobil Supabase public yapılandırması API'den alınabiliyor; giriş/yenileme/çıkış için sınırlı ve TLS doğrulamalı ortak geçit var.
- [x] Web önizlemede çalışmayan Alert geri bildirimleri düzeltildi; kayıt/giriş, şifre gösterme, şifre yenileme ve e-posta tekrar gönderme akışları var.
- [x] İşletme listeleri sanallaştırılıyor, arama 300 ms geciktiriliyor, tarih/saatler İstanbul saat diliminde gösteriliyor; aynı rezervasyon denemesinde işlem anahtarı korunuyor.
- [x] 8 mobil akış E2E senaryosu kontrollü test API'siyle geçti; gerçek Supabase kimlik servisine erişim ve hatalı parola yanıtı canlı önizlemede doğrulandı.
- [x] Mobil oturumlar işletim sistemi SecureStore alanında parçalı ve kalıcı saklanıyor.
- [x] Next.js API rotaları web cookie oturumuna ek olarak doğrulanmış Bearer token kabul ediyor.
- [x] Servis rolü anahtarı mobil pakete konmuyor; tenant sınırları Supabase RLS ve API yetkilendirmesiyle korunuyor.
- [x] API isteklerinde zaman aşımı, kontrollü hata mesajı, query cache/retry ve rezervasyonda idempotency anahtarı var.
- [x] Development CORS yalnızca bilinen Expo origin'lerine açık; production web origin'leri `MOBILE_ALLOWED_ORIGINS` ile açıkça tanımlanıyor.
- [x] `expo-doctor` 21/21 kontrolü geçti; TypeScript, Android/iOS Hermes paketleri ve static web export doğrulandı.
- [ ] Fiziksel iPhone ve Android cihazda düşük ağ, çevrimdışı/geçiş, deep-link ve klavye testlerini tamamla.
- [ ] Ayrı müşteri, işletme ve admin hesaplarıyla RLS/IDOR mobil penetrasyon testini kayda al.

## EAS ve mağaza hazırlığı

- [ ] Expo hesabında projeyi oluştur ve oluşan `extra.eas.projectId` değerini `app.json` içine ekle.
- [ ] EAS ortamına `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SUPABASE_URL` ve `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` ekle.
- [ ] Apple Developer ve Google Play Console hesaplarında `com.salonny.app` kimliğini ayır.
- [ ] Production API, gizlilik politikası, kullanım şartları ve hesap silme URL'lerinin herkese açık HTTPS adreslerini doğrula.
- [ ] Supabase Auth Redirect URLs listesine production `/auth/reset-password` adresini ekle; doğrulama/kurtarma e-postasını gerçek posta kutusuyla kabul testinden geçir.
- [ ] Apple/Google imzalama kimliklerini EAS Credentials ile oluştur veya güvenli kasadan bağla.
- [ ] `eas build --profile preview --platform all` ile iç dağıtım paketlerini üret ve cihaz kabul testini tamamla.
- [ ] Kamera/konum/bildirim gibi ileride eklenecek izinleri sadece gerektiğinde ve açıklama metniyle iste.
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
