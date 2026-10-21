# Hesap silme talebi ve işletme yayını — 21 Ekim 2026

## Kapsam ve doğru anlam

Uygulamadaki düğme hesap erasure işlemi değil, incelemeye alınacak bir **silme talebidir**. Bu teslimat talebi gerçek silme olarak sunmaz. Talebin işlenme sorumlusu, süre hedefi, durum takibi ve erasure kanıtı QA-16 kapsamında açık kalır. Mevcut müşteri/randevu kayıtlarını silme, randevu iptali, SMS, ödeme veya yeni test hesabı oluşturma yapılmaz.

042 migration'ı açık talebi olan (`requested`/`processing`), işlemi tamamlanmış (`completed`) veya profili soft-delete edilmiş sahibin işletmesini yayımlama/doğrulama yolunu kapatır. Böyle bir sahibin yayımlanmış veya incelemedeki işletmesi aynı transaction'da `suspended` olur, doğrulama işareti kaldırılır ve audit yazılır. Başka işletmede yalnız çalışan olmak o işletmeyi kapatmaz. Red/undelete otomatik yeniden yayınlamaz; yeni admin kararı gerekir.

## Uygulama ve giriş noktaları

- Web profil/güvenlik → `/delete-account` ve native profil, aynı doğrulanmış `/api/customer-profile` DELETE → `request_account_deletion` RPC'sini kullanır. Caller kimliği sunucunun doğruladığı oturumdan gelir; gövdede başka kullanıcı kimliği kabul edilmez. Sonuç makbuzu olmadan başarı gösterilmez. Tekrarlanan istek aynı açık talebe döner.
- Legacy istemcinin doğrudan self-INSERT'i de aynı DB trigger'larından geçer. Admin approve/verify, işletme doğrudan güncellemesi ve kullanıcı soft-delete yolları DB'de korunur; yalnız UI kontrolüne güvenilmez.
- Advisory transaction lock çakışması `40001` ile güvenli şekilde başarısız olur. Audit hatası talep/yayından çekmeyi bütünüyle geri alır. Gerçek iki bağlantılı yarış veya yüksek yük kabulü yapılmış sayılmaz; yerel contention testi sentetik hata enjeksiyonudur.
- Web ana sayfa, keşif, API sayfaları, detay, SEO detay ve booking; native ana sayfa/vitrin/dizin/favoriler/detay/booking birlikte ele alındı. Sabit Ağustos işletme snapshot'ları kaldırıldı; yalnız kategori navigasyon etiketleri yedeği kaldı.
- Yazım sonrasında ortak Next tag cache hemen expire edilir, ilgili yollar geçersiz kılınır. Process-local liste Map'leri kaldırıldı. Public JSON CDN'de `no-store`, detay okumaları request-scoped memoization kullanır. Native kendi talebinden sonra sorguları geçersiz kılar; doğrulanmış 404'te listeleri yeniler. 503/zaman aşımı silinme gibi sunulmaz.
- Out-of-band/legacy DB yazımı Next cache sinyali göndermez; sunucu liste cache'i 60 saniyelik yenileme politikasına bağlıdır. Tüm açık eski tarayıcı sekmelerinin anlık uzaktan temizlendiği iddia edilmez. Güncel app yazımı API invalidation yolunu kullanır; detay isteği yeniden canlı public görünürlüğü kontrol eder.

## Canlı kontrol — isimle keyfî silme yapılmadı

Kullanıcı uygulamadaki silme işlemini, adı Can olan bir kayıtla bildirdi. 21 Ekim ön kontrolde **0 silme talebi**, **5 kullanıcı / 4 işletme / 9 randevu** vardı. Can'ın Auth kaydı mevcuttu, public profilinde soft-delete işareti yoktu; işletme public detay API'si 200 döndü. Eski olayın aynı anda yeniden üretildiği veya Can'ın hesabının kaldırıldığı iddia edilmez. İsme göre hesap/işletme askıya alınmadı.

Kullanıcının açık 042 onayından sonra migration mevcut `inkybypxpqqoajufhdol` projesine SQL Editor üzerinden transaction olarak uygulandı. Son salt-okunur kabulde altı kapı PASS: 9 definer işlevinin güvenli search_path'i, private helper ACL'leri, authenticated-only talep RPC'si, 5 etkin trigger, geçerli owner index'i ve bloklu sahibin public/doğrulanmış işletmesi olmaması. Sayılar **5/4/9/0** kaldı; **0 withdrawal audit**, yani eski işletme durumu değiştirilmedi. Kabul sorgusu `supabase/tests/account_deletion_lifecycle_deployment_verify.sql`; özel ekran kanıtı Git dışında `artifacts/account-lifecycle-live-042.png`.

Dokuz işlev gövdesi LF/kenar whitespace normalize MD5 karşılaştırmasıyla kanonik kaynakla eşleşti. Tam kaynak tek `statements` kaydı olarak migration geçmişine eklendi, kaynak hash'i ayrıca doğrulandı; `supabase/tests/account_deletion_lifecycle_source_verify.sql` tekrar üretir. MD5 yalnız drift kontrolüdür, güvenlik/imza mekanizması değildir.

## Yerel doğrulama

- Son tam birim/API koşusu: 1.254 başarı / 2 isteğe bağlı ağ testi atlaması. Önceki tam koşu 1.253 başarıydı; ek auth senaryosundan sonra ortak IP kotasına takılan ilk tekrar başarılı sayılmaz. Profil yetki/RPC testleri kendi quota sonucuna izole edildi; gerçek limiter testleri/üretim kuralları değiştirilmedi. Koşular toplanmaz.
- On SQL motoru 690 kontrol; bunun 33'ü yeni lifecycle motoru. Ayrı şehir motoru 23 kontrol. Sentetik verilerde kayıt koruma, anon/RLS/ACL, başka kullanıcı adına talep, admin approve/verify, self publish, tekrar, soft-delete, reject/undelete, rollback ve sentetik contention kapsandı.
- Lint, web/native tip kontrolü, dependency güvenlik kapısı ve production Next build geçti. Local native web export geçti; fiziksel iOS/Android kabulü ve gerçek ayrı rol JWT yazımı değildir.
- Native ilk hedef koşu 12/12; ek eksik makbuz senaryosu sonrası lifecycle hedefi 5/5. Web desktop + responsive son hedef koşu 6/6, taşma yok. İlk web koşu 4 başarı/2 hata: Redis yapılandırılmamış production sunucusunun auth öncesi güvenli 503 reddi yanlışlıkla 401 beklenmişti; güvenlik gevşetilmedi. Web ekran kapısı açık 403 kaynak reddini, API birim testi sağlıklı limiter altında anonim 401/no-write reddini ayrı doğrular. İlk başarısız koşular başarılı sayılmaz. Gerçek hesap silme talebi gönderilmedi.
- GitHub/Netlify son kabulü aşağıdadır; kod/DB testleri gerçek erasure, ayrı rol JWT veya fiziksel cihaz kabulüyle aynı değildir.

## Yayın ve canlı kabul

Uygulama kaynağı **bf38a80dc829c61c0e79cad400cb38d674f05571**, [Netlify production 6ad8ebbcd5ab07705a772e4d](https://app.netlify.com/projects/salonny-preview/deploys/6ad8ebbcd5ab07705a772e4d) üzerinde **Published**. Hem Next backend/web hem hosted native export aynı yayındadır. Kaynakta `.env`/anahtar, kullanıcı verisi, özel ekran izi veya generated bundle commit edilmedi.

`node scripts/verify-marketplace-lifecycle-preview.mjs`: **15/15 canlı kapı** geçti. Basic/şehir/highlight JSON cache yasağı, mevcut işletme detayı, kayıp kaydın gerçek API 404'ü, web/SEO/booking güvenli boş durumu, yeni native bundle/JS MIME/missing-JS 404, DB'ye ulaşmadan kaynak reddi ve DB + dağıtık limiter readiness kontrol edildi. İlk helper denemesi regex sözdizimi hatasıyla ağ isteği atmadan durdu; düzeltilmiş tam koşu ayrıdır ve önceki deneme başarı sayılmaz.

Gerçek tarayıcıda yayımlanan web ve hosted native bulunamayan-kayıt ekranı → Keşfet geçişleri doğrulandı; mevcut İzmir tercihi korunarak her ikisi de aynı iki sonucu gösterdi. Mevcut Can detayı da web ve native önizlemede açıldı. Hiçbir talep/randevu/hesap/okundu yazımı veya GPS izni oluşturulmadı. Özel ekran kanıtları `artifacts/account-lifecycle-live-web.png` ve `artifacts/account-lifecycle-live-native.png` içinde, Git dışındadır.

İlk [push CI](https://github.com/Materlayt1/salonny/actions/runs/39637355902) ve [PR CI](https://github.com/Materlayt1/salonny/actions/runs/39637364164): iki doğrulama job'unda lint, web/native tip, 1.254 birim/API (2 isteğe bağlı ağ atlaması), 690 + 23 SQL, bağımlılık güvenliği, production Next build ve iOS/Android/web export geçti. İki native tam koşuda ayrı ayrı **239 ilk-deneme başarısı / 2 isteğe bağlı canlı görsel atlaması**, retry/flaky yok. Takip eden web koşuları **47 başarı / 2 hata / 1 platform atlaması**: yeni testin anonim yönlendirmeyi yalnız HTTP 3xx sanması, kimlik servisi ayarsız CI'daki HTTP 200 içindeki Next streaming redirect'i reddetti. Bu koşuların geneli başarılı sayılmaz.

Test, gerçek tarayıcının `/auth/login` adresine ulaşmasını, giriş başlığını ve silme formunun gösterilmemesini doğrulayacak şekilde düzeltildi. Kaynak reddi hâlâ kesin 403 bekler; auth/limiter/ürün kodu değişmedi. Yerel yeni desktop/responsive hedef koşu **6/6**, retry yok. İlk CI hata izleri `artifacts/lifecycle-first-ci-failure` içinde Git dışında korunur. Bu test-only düzeltmenin yeni temiz CI kabulü henüz kaydedilmedi.

Web özel hesap silme formunun gerçek oturumla submit'i, gerçek kullanıcı talebi oluşturulmadan denenmedi; SSR/form güvenlik testi, yetkili API/SQL fixture'ları ve native intercepted submit birbirinin veya gerçek erasure kabulünün yerine geçmez. Canlıdaki önceden girilmiş geçersiz şehir/telefon metinleri de bu görevde sessizce düzeltilmedi; QA-26'ya aittir.

Bu teslimat genel GO, mağaza kabulü, gerçek erasure iş akışı veya binlerce eşzamanlı üretim trafiği garantisi değildir.
