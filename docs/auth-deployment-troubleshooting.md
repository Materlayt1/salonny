# Vercel giriş kabulü

11 Ekim 2026. Yerel girişin çalışması, Vercel dağıtımındaki girişin çalıştığını kanıtlamaz. GitHub push'u, başarılı Vercel build'i ve gerçek hesapla giriş ayrı kabul adımlarıdır.

## Bu turdaki bulgular

- Kullanıcı kendi hesabının localhost'ta giriş yaptığını doğruladı; hata verdiği adres `https://salonny-git-codex-dynamic-preview-salonny1.vercel.app/auth/login`.
- Aynı Vercel ekranında, hiçbir gerçek hesabı kullanmayan tek geçersiz kimlik isteğiyle eski genel hata tekrarlandı. Hesap oluşturulmadı, gerçek parola okunmadı/değiştirilmedi.
- Yerel Supabase sağlık geçidi 200; sentetik geçersiz kimlik isteği 400 / `invalid_credentials`. Bunlar kullanıcıya ait başarılı Vercel girişi değildir.
- İlk oturumsuz terminal kontrolü Vercel Authentication'a 302 döndü; bu uygulama sağlık sonucu değildi. Kullanıcı daha sonra Vercel panelinde oturum açtı.
- GitHub uzak branch'i `b4b8378` push'unu doğruladı; bu commit'in Vercel durum kontrolü `success / Deployment has completed` oldu. Aynı Preview adresi yeniden yüklendiğinde sentetik geçersiz kimlik isteği artık “Giriş servisine ulaşılamadı” verdi. Kod dağıtımı doğrulandı; servis kaynaklı giriş engeli sürüyor, gerçek kullanıcı hesabıyla Vercel girişi kabul edilmiş sayılmaz.
- Sonraki `4ef010d` için iki GitHub kalite koşusu (`verify` ve `mobile-flows`) ve Vercel deployment başarılı. 11 Ekim 09:26'da yetkili panel kaydı kesin kök nedeni gösterdi: `/api/auth/supabase/token` 503, `auth_proxy_rejected.stage = rate_limit`. Preview'da Redis değişkenleri yoktu; paylaşılan değişken bağlantısı ve mevcut Storage kaynağı da yoktu. İstek Supabase'e ulaşmadan güvenli biçimde kapanıyordu.
- Kullanıcının hizmet şartları/veri paylaşımı ve ücretsiz kurulum onayıyla `salonny-preview-rate-limit` oluşturuldu: **Free**, aylık 500.000 komut, Frankfurt `fra1`, ek okuma bölgesi yok, eviction kapalı. Bağlantı yalnız **Preview** için; Production ve Development seçilmedi. Vercel, `KV_REST_API_URL` / yazabilen `KV_REST_API_TOKEN` dahil beş değişkeni **Sensitive** olarak oluşturdu. Değerler gösterilmedi, kopyalanmadı, chat/repo'ya yazılmadı; Supabase kullanıcı/randevu kayıtları değişmedi.

## Kod düzeltmeleri

- Supabase API sürüm başlığı doğrulanıp istek/yanıtta korunur; SDK modern `code` ve eski `error_code` biçimlerini okuyabilir.
- Yerel güvenlik kapıları SDK'nın okuyabildiği hata gövdesini verir; 429/503 ve Retry-After korunur. Üretimde Redis yoksa güvenli kapama değişmez.
- SDK 5xx hata gövdesindeki kodu okumadığı için müşteri/admin giriş, kayıt ve server action mesajları HTTP durumunu da kullanır. Bilinmeyen 400/401, yanlış parola olarak tahmin edilmez.
- SSR giriş/kayıt formu React hazır olana kadar yazım/gönderim kabul etmez; mobil erken yazımın silinmesi engellenir. Zamanlayıcıyla geciktirme veya sahte giriş yoktur.
- Sunucu `auth_proxy_rejected` olayında yalnız endpoint, durum, güvenli kod ve aşama tutulur. E-posta/parola/oturum/API anahtarı/ham sağlayıcı metni kayda eklenmez.
- Redis yapılandırması eski `UPSTASH_REDIS_REST_URL/TOKEN` çifti veya Vercel'in `KV_REST_API_URL/TOKEN` çiftiyle çalışır. Aileler karıştırılmaz; kısmen tanımlı asıl çift diğer aileye sessizce düşmez. Read-only token kullanılmaz; production güvenli kapama ve TLS/CSRF/oran sınırları korunur. Readiness ve yayın script'i aynı çözümleyiciyi kullanır.

Doğrulama: 303/303 birim testi; gerçek form/SDK ile masaüstü+mobil 12/12 kontrollü E2E (429/503/modern 400, tekrar deneme, alanların korunması, JavaScript kapalı SSR guard'ı ve mevcut onboarding). Gerçek hesaba yazım yok, retry kullanılmadı. Web TypeScript, tam lint, güvenlik kapısı (`unresolved: []`) ve Next.js 16.3.8 production build başarılı. Bu sonuçlar gerçek Vercel dağıtımı/hesap kabulünün yerine geçmez.

Redis uyumluluğu devam turu: **397/397** birim/yetki testi, web TypeScript, tam ESLint ve Next.js 16.3.8 production build başarılı. Gerçek SDK → gerçek POST handler → mocked Redis zincirinde KV EVAL izniyle Supabase 400'e ulaşma; limitte 429; kesinti/bozuk yanıtta 503 ve upstream'e gitmeme doğrulandı. Readiness script'inin 13 izole testi gerçek `.env` veya ağ kullanmaz. Önceki 12 UI E2E bu turda yeniden koşulmadı; canlı Redis EVAL ve gerçek hesap kabulü yeni deployment sonrası ayrıca doğrulanır.

GitHub temiz Linux runner'ında ayrıca mobil MapLibre CSS side-effect import tipi eksikti. Yerelde ignored `expo-env.d.ts` bunu gizliyordu; tracked `apps/mobile/types/assets.d.ts` içine yalnız bu CSS modülü için ambient declaration eklendi. Kontrollerin kapatılması veya genel wildcard eklenmesi gerekmedi. Expo'nun ürettiği dosyalar repo'ya eklenmez.

## Dağıtım kabul sırası

1. Vercel Deployments'ta branch `codex/dynamic-preview` ve beklenen Git commit'inin Ready olduğunu doğrula. Eski dağıtımı veya başarısız build'i yeni push olarak kabul etme.
2. Project Settings → Environment Variables içinde **Preview**, varsa bu branch'e özel override'ları kontrol et. Production'daki değerlerin Preview'a otomatik uygulanacağını varsayma.
3. Aynı Supabase projesinin `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` değerleri ve `NEXT_PUBLIC_SUPABASE_OFFLINE` ayarını doğrula. Anahtarları log/chat/repo'ya kopyalama. URL, Salonny projesini göstermeli.
4. `UPSTASH_REDIS_REST_URL/TOKEN` **veya** `KV_REST_API_URL/TOKEN` aynı aileden eksiksiz ve geçerli olmalı. Asıl UPSTASH ailesi kısmen tanımlıysa önce onu düzelt; KV'ye gizli fallback yoktur. Redis'in yazabilen token'ı ve Lua EVAL erişimi gerekir; yalnız PING başarısı mutasyon kapasitesini kanıtlamaz. Gerçek bağlantı/ACL sorunu varsa çöz; production'ı memory fallback'e geçirmek veya NODE_ENV'i development yapmak çözüm değildir.
5. Ortam değişkenleri değiştiğinde **yeni deployment** oluştur. Vercel mevcut deployment'ın ortamını geriye dönük değiştirmez; NEXT_PUBLIC değerleri istemci bundle'ında da derlenir.
6. Yetkili erişimle `/api/health/ready`: 200 / `ready`, database `ok`, distributedRateLimit `ok`; ayrıca `/api/auth/supabase/health`: 200 beklenir. Deployment Protection'ı sırf bu kontrol için kapatma.
7. Kullanıcı kendi hesabıyla bir kez dener. Runtime Logs'ta gerekirse `auth_proxy_rejected` aşamasına bak:

| Aşama | Kontrol |
| --- | --- |
| `rate_limit` / 503 | Dağıtık güvenlik servisi eksik/erişilemez; Supabase'e henüz gidilmedi |
| `rate_limit` / 429 | Deneme sınırı; Retry-After dolmadan tekrar/bypass yok |
| `configuration` | Supabase ortam ayarları/offline anahtarı |
| `connection` | Supabase'e DNS/TLS/ağ/timeout; sertifika kontrolünü kapatma |
| `upstream` | Supabase hata kodu; yanlış kimlik, doğrulanmamış e-posta veya servis hatasını ayır |

`NEXT_PUBLIC_APP_URL` ve Supabase izinli redirect adresleri ayrıca doğrulanmalıdır; özellikle e-posta doğrulama/parola yenileme için önemlidir. Yanlış Site URL tek başına bu password-token girişinin nedeni olarak varsayılmaz. Kullanıcı parola/OTP değişikliğini kendisi tamamlar.

Resmî kaynaklar: [Vercel ortam kapsamları](https://vercel.com/docs/environment-variables/manage-across-environments), [değişikliklerin yeni deployment'a uygulanması](https://vercel.com/docs/environment-variables), [Upstash Vercel entegrasyonu](https://upstash.com/docs/redis/howto/vercelintegration).
