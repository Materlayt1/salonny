# Salonny

Türkiye'deki hizmet işletmelerini müşterilerle buluşturan, randevu ve işletme yönetimi odaklı SaaS + marketplace uygulaması.

## Çalıştırma

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Uygulama operasyonel veriler için Supabase gerektirir. Anahtarlar eksikse güvenli boş durumlar gösterilir. Yalnızca GitHub Pages görsel demosunda `NEXT_PUBLIC_DEMO_MODE=true` ile 35 adet açıkça kurgusal, salt-okunur işletme kaydı kullanılır; randevu, ciro veya kullanıcı verisi üretilmez. Rezervasyonlar `/api/bookings` üzerinden atomik PostgreSQL RPC'si ile oluşturulur.

## Doğrulama

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
```

## Ana rotalar

- `/` — müşteri marketplace ana sayfası
- `/kesfet` — arama, filtre ve harita görünümü
- `/business/[slug]` — public işletme profili
- `/[city]/[district]/[category]/[slug]` — SEO uyumlu kanonik işletme profili
- `/booking/[slug]` — uçtan uca rezervasyon akışı
- `/appointments` — müşteri randevuları
- `/business/dashboard` — işletme yönetimi
- `/business/calendar` — çalışan bazlı takvim
- `/business/onboarding` — işletme kayıt akışı
- `/admin` — platform yönetimi

## Üretim kurulumu

1. Supabase projesini oluşturun ve `.env.example` içindeki değişkenleri tanımlayın.
2. `supabase/migrations` altındaki migrasyonları dosya sırasıyla çalıştırın.
3. `supabase/seed.sql` yalnızca geliştirme/preview ortamında çalıştırılmalıdır.
4. Gerçek ödeme ve iletişim sağlayıcılarını `lib/providers` altındaki arayüzlere uyarlayın.
5. Vercel ortam değişkenlerini ekleyip build doğrulamasından sonra deploy edin.

Kart bilgileri uygulama veritabanında saklanmaz. Plan fiyatları kod içine gömülü değildir. Ödeme, SMS, e-posta ve WhatsApp sağlayıcıları bağlanmadan ilgili gerçek gönderim/ödeme seçenekleri açılmaz. Seed ve geliştirme hesapları production ortamında çalıştırılmamalıdır.
