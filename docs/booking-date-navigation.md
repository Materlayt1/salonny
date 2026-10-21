# Web randevu tarih seçimi düzeltmesi

11 Ekim 2026. Kullanıcı tarih kartları arasında geçişte takılma ve sağda kalan günlere erişememe bildirdi.

## Neden ve düzeltme

Seçili güne tekrar tıklamak `loading` durumunu açıyordu; `date.iso` değişmediğinden uygunluk effect'i tekrar çalışmıyor, yükleme sonsuza kadar kalıyordu. Aynı hizmet/uzmana tekrar tıklamak da bu hatayı tetikleyebiliyordu. Tarih şeridinde kaydırma çubuğu gizliydi ve görünür gezinti düğmesi yoktu.

- Seçili gün/hizmet/uzmana tekrar tıklama artık no-op; gereksiz sorgu veya sahte yükleme başlatmaz.
- Uygunluk hazır durumu işletme/şube/uzman/hizmet/tarih ve yerel istek revizyonuna bağlıdır. Her gerçek seçim değişiminde revizyon artar; A → B → A dönüşünde eski A sonucuyla devam edilmez.
- Değişimde eski saat temizlenir; yeni takvim sonuçlanmadan “Devam Et” kapalıdır. Terk edilen isteğin yanıtı/hatayı yeni güne taşıması engellenir ve fetch iptal edilir.
- İstek 15 saniyede zaman aşımına uğrar; hata ve “Tekrar dene” gösterilir. Hatalı sorgu yanlış “uygun saat yok”/bekleme listesi durumu olarak sunulmaz.
- Mevcut 14 günlük pencerenin iki ucuna görünür önceki/sonraki okları eklendi. Günler klavye ile seçilebilir; tam tarih etiketi, seçili gün semantiği ve yalnız şerit içi kaydırma korunur. Ay/yıl ve seçili tam tarih gösterilir; sayfanın tamamı yatay taşmaz.

## Doğrulama

- **484/484** birim/yetki testi geçti.
- Son kaynak üzerinde web TypeScript, tam lint ve Next.js production build geçti.
- Tam web E2E: **49 geçti / 9 platform koşullu atlandı**, hata/retry yok. Yeni dosyadaki **22/22 tarih senaryosu** geçti; gerçek işletme yok diye atlanan tarih senaryosu olmadı.
- Masaüstü Chromium ve iPhone tarayıcı projesi: tekrar seçim, doğru tarih isteği, bekleyen seçimde eski saatle ilerlememe, gecikmiş yanıt, A → B → A, 390/1280 px oklarla ilk/son güne erişim ve belge genişliği, klavye, hata/retry ve gerçek 15 saniye timeout/retry.
- Gerçek Gogo ekranında yalnız okuma/seçimle 12 → 13 → 20 Ekim geçişi, seçili günü tekrar tıklama, sağdaki tarihlere okla ulaşma ve 390 px şerit doğrulandı. Randevu/bekleme listesi onayı gönderilmedi.

Kontrollü testler public işletmeleri okur, uygunluk yanıtlarını taklit eder; randevu/bekleme listesi yazımları engellenir. Veritabanı, kupon hakları ve mevcut randevular değiştirilmedi. Bunlar web ve responsive tarayıcı testleridir; fiziksel cihaz/native Expo veya gerçek rezervasyon/yük kabulü olarak sunulmaz.

Kaynaklar: `components/booking-date-picker.tsx`, `components/booking-flow.tsx`, `e2e/booking-dates.spec.ts`.
