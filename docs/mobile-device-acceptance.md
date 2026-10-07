# Fiziksel cihaz kabul planı

7 Ekim 2026. Bu plan henüz uygulanmadı. Tarayıcı E2E ve Hermes export sonuçları fiziksel iOS/Android testinin yerine geçmez. Mağaza hesapları hazır olmadığından imzalı paket üretilmedi.

## Ön koşullar

- Production HTTPS API adresi, EAS proje kimliği ve uygun iç dağıtım imzaları.
- MapLibre için Expo Go değil özel native development/preview build.
- Test kullanıcıları ve işletme yalnız ayrı test ortamında; gerçek müşteri randevuları, iletişim veya çalışma planı değiştirilmez.
- Her kayıtta uygulama sürümü, platform/OS, cihaz modeli ve sonuç tutulur; parola, token, tam konum veya müşteri bilgisi loglanmaz.

## Her iki platformda yürütülecek kontrol

| Senaryo | Beklenen sonuç | iOS | Android |
| --- | --- | --- | --- |
| İlk açılış / düşük ağ | Logo ve dürüst yükleme durumu, zaman aşımı sonrası tekrar yolu | Bekliyor | Bekliyor |
| Giriş, klavye Sonraki / Gönder | Alan etiketleri kalır, ilk hataya odak, şifre maskesi korunur | Bekliyor | Bekliyor |
| Doğrulama / şifre kurtarma | Gerçek test posta kutusundan HTTPS/deep-link dönüşü | Bekliyor | Bekliyor |
| Uygulamayı kapat/aç, oturum yenile/çıkış | SecureStore oturumu doğru; başka hesaba veri taşınmaz | Bekliyor | Bekliyor |
| Filtre uygula/vazgeç/sıfırla | Taslak sonuçları değiştirmez; sabit arama ve doğru sonuçlar | Bekliyor | Bekliyor |
| Büyük sistem yazı boyutu / VoiceOver / TalkBack | Metin kesilmez, seçili durum duyurulur, düğmeler erişilebilir | Bekliyor | Bekliyor |
| Harita / konum reddi ve kapatma | Liste kullanılabilir; yaklaşık konum ve kullanıcı kontrolü | Bekliyor | Bekliyor |
| Fotoğraf galeri / pinch / pan / geri | Yakınlaştırma sınırlı, kapanır, durum çubuğu kontrastı korunur | Bekliyor | Bekliyor |
| Randevu adımları ve klavye | Sabit özet görünür, kullanıcı girdisi kaybolmaz | Bekliyor | Bekliyor |
| Ağ kesintisi / tekrar / saat çakışması | Sahte başarı yok, aynı denemede anahtar korunur, yeni saat açıkça seçilir | Bekliyor | Bekliyor |
| İptal/değişiklik ve yorum | Açık onay, doğru test kaydı, uygun rol ve durum sınırı | Bekliyor | Bekliyor |
| İşletme/şube/hesap değiştirme | Önceki kapsamın kayıtları veya form taslağı taşınmaz | Bekliyor | Bekliyor |
| Profil, saatler, izin ve kampanya hatası | Yanlış işletmeye yazma yok, hata halinde form korunur | Bekliyor | Bekliyor |
| Arka plan/ön plan ve Android geri / iOS geri | Modal ve navigasyon güvenle kapanır, yinelenen işlem olmaz | Bekliyor | Bekliyor |

Tüm kritik senaryolar geçmeden TestFlight/Play Internal Testing sonrası public rollout açılmaz. Production Redis/readiness, izleme, yedekleme ve kapasite kapıları ayrıca tamamlanmalıdır.
