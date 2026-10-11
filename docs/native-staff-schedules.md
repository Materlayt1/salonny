# Native ileri vardiyalar

11 Ekim 2026. Kod/test kapısı hazır; canlı `202610110031_native_staff_schedules.sql` onayı beklenir. Ekip → çalışan araçları → özel vardiya dönemleri; native ekran dış tarayıcıya yönlendirmez.

## Kullanım ve sınırlar

- Bir çalışanın seçili şubedeki dönemleri 25'lik sayfalarda; şube atamaları bağımsız 50'lik sayfalarda açılır. Başka şubenin dönemleri “Vardiyaları aç” ile aynı işletme kapsamında incelenir.
- Gün, başlangıç/bitiş ve isteğe bağlı tarih aralığıyla tek dönem eklenir/düzenlenir/silinir. Tarih sınırları dahilidir; aynı gündeki çakışan dönem reddedilir. Geceyi aşan yeni dönem yerine ayrı gün dönemleri gerekir.
- Tarihli dönemler mevcut uygunluk motorunda **ek dönemdir**; haftalık planın otomatik yerine geçmez. Özel vardiya olmayan günler işletme saatlerini kullanır. Saat dilimi gerçek uygunluk motoruyla aynı, işletmenin saat dilimidir.
- Yeni input saniye ve en fazla altı basamak kesir kabul eder. Güncelleme/silme snapshot'ı eski hassasiyeti korur; legal eski `24:00` ve ilgili günün hiç gerçekleşmediği eski tarih aralığı yalnız temizleme için kabul edilir.
- Aktif çalışan/şube/atama yeni dönem için zorunlu. Pasif şube/çalışan eski dönemleri temizlenebilir; pasif şubeye yeni atama yapılamaz. Pasif çalışan aktif şubeye hazırlık amacıyla atanabilir.
- Atama kaldırılırken herhangi bir vardiya veya sürmekte olan/gelecekteki bekleyen/onaylı randevu varsa işlem durur. Mevcut randevular değiştirilmez. Dönem silme ve kaydedilmemiş taslağı bırakma onay ister.
- Oluşturma UUID'si aynı mevcut dönemle tekrar güvenlidir; dönem sonradan değişmişse 409. Bu, sonsuza kadar tutulan bir replay defteri değildir. Düzenleme/silme tam beklenen snapshot ile çalışır; çakışmada taslak korunur ve güncel kayıt açıkça yüklenir.

## Veritabanı kapısı

Sahip/yönetici ve aktif işletme üyeliği gerekir; genel ADMIN rolü tenant sınırını atlayamaz. Dönem ve şube ataması aynı çalışan kilidini paylaşır. Ham çalışma saati yazımları kapatılır, RLS okumaları korunur. Atama/üst tenant/randevu tetikleyicileri dolaylı uyumsuzlukları engeller. Haftalık toplu değiştirme, tarihli/çok parçalı planı transaction içinde tekrar kontrol ederek korur.

031 preflight tutarsız tenant, atama, tarih veya açık randevuda durur; veriyi silmez/onarmaz. `native_staff_schedules_deployment_verify.sql` 12 salt-okunur metadata/ACL kontrolüdür. Canlı kurulumda migration geçmişi başarıyla aynı transaction'da işlenmelidir.

`scripts/test-staff-schedule-engine.mjs` izole PostgreSQL/WASM fixture'ında 29 katalog/motor/preflight kontrolünden geçti. 16 kontrollü native E2E; kapsam, saniye/kesir snapshot'ı, stale/çakışma, pasif şube temizliği, atama, sayfalama, tekrar, onay ve dar ekranı kapsar. Gerçek JWT/RLS, staging eşzamanlı booking/unlink yarışı ve cihaz kabulü değildir; bu kapılar ayrıca açık kalır.
