# Salonny production operasyon runbook'u

Son güncelleme: 14 Eylül 2026. Ödeme sistemi kapsam dışıdır.

## Trafik açma kapısı

Production trafiği yalnızca aşağıdaki koşullar birlikte sağlandığında açılır:

1. `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm test:e2e` ve `pnpm audit --prod` başarılıdır.
2. `/api/health/live` ve `/api/health/ready` art arda en az beş dakika `200` verir.
3. Production'da `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET` ve iletişim sağlayıcı değişkenleri tanımlıdır.
4. `NEXT_PUBLIC_APP_URL` gerçek HTTPS alan adıdır; Supabase Auth redirect URL listesi aynı alan adını içerir.
5. Son migration sürümü production ve staging'de aynıdır. Doğrulama: `select version,name from supabase_migrations.schema_migrations order by version desc limit 5;`.
6. WAF, CDN, log drain, alarm kanalları, yedekleme ve kota alarmları etkin durumdadır.

## SLO ve alarmlar

| Gösterge | Hedef | Alarm |
| --- | --- | --- |
| Aylık erişilebilirlik | %99,9 | 5 dk pencerede başarısız istek > %2 |
| API p95 | ≤ 500 ms | 10 dk boyunca > 750 ms |
| API p99 | ≤ 1.500 ms | 10 dk boyunca > 2.000 ms |
| Rezervasyon başarı oranı | ≥ %99 (geçersiz/çakışan talepler hariç) | 15 dk boyunca < %97 |
| LCP p75 | ≤ 2,5 sn | 30 dk boyunca > 2,5 sn |
| INP p75 | ≤ 200 ms | 30 dk boyunca > 200 ms |
| CLS p75 | ≤ 0,1 | 30 dk boyunca > 0,1 |
| İletişim dead-letter | 0 normal durum | 10 dk içinde ≥ 1 |
| Supabase bağlantı kullanımı | < %70 sürekli | 15 dk boyunca ≥ %80 |

Core Web Vitals ve sunucu olayları `LOG_DRAIN_URL` hedefine JSON olarak gönderilir. Log hedefinde `event`, `level`, `service`, `environment` ve `timestamp` alanları indekslenmelidir. Telefon, e-posta, mesaj gövdesi ve bakım notu loglanmamalıdır.

## İletişim worker'ı

Scheduler her dakika aşağıdaki isteği yapar:

```text
POST /api/internal/communications/process
Authorization: Bearer <CRON_SECRET>
```

Worker en fazla 25 işi atomik olarak claim eder. Başarısız işler 30 saniyeden başlayan üstel geri çekilmeyle yeniden denenir ve beşinci başarısız denemede `dead_letter` olur. Sağlayıcı URL ve anahtarı yoksa geliştirme ortamında bile sahte teslimat kaydı üretilmez.

## Olay müdahalesi

1. Alarmı kabul et, başlangıç saatini ve etkilenen yüzeyi kaydet.
2. `/api/health/live`, `/api/health/ready`, Supabase durumu, Redis ve son deploy'u kontrol et.
3. Veri bütünlüğü riski varsa rezervasyon yazma trafiğini bakım sayfasına al; okuma yüzeyini mümkünse açık tut.
4. Sorun son deploy ise platformun atomik önceki sürüme dönüşünü kullan. Veritabanında `git reset` veya geri döndürülemez elle silme yapma; ileri yönlü düzeltme migration'ı hazırla.
5. İletişim sağlayıcısı arızasında worker cron'unu durdur; `queued/retry` kayıtlarını koru.
6. İhlal şüphesinde service-role, Redis, cron ve sağlayıcı anahtarlarını sırayla döndür; Supabase Auth oturumlarını gerektiğinde geçersizleştir.
7. Olay sonrası 48 saat içinde neden, etki, zaman çizelgesi ve kalıcı aksiyonlarla postmortem yaz.

## Yedekleme ve geri yükleme tatbikatı

- Platform yedeklemesi ve desteklenen planda PITR etkinleştirilir; saklama süresi iş gereksinimine göre yazılı onaylanır.
- Her ay izole staging projesine geri yükleme yapılır. İşletme, şube, müşteri, randevu ve RLS politika sayıları kaynakla karşılaştırılır.
- RPO hedefi 15 dakika, RTO hedefi 60 dakikadır. Plan bu hedefleri desteklemiyorsa trafik açılmaz veya hedef açıkça revize edilir.
- Storage bucket'ları ayrıca envanterlenir; `customer-care-assets` hiçbir zaman public yapılmaz.

## Kapasite ve yük testi

Production'a doğrudan yük testi yapılmaz. Anonimleştirilmiş staging verisiyle sırasıyla 1k, 10k ve hedef eşzamanlılık kademeleri çalıştırılır. Her kademe en az 15 dakika sürer; hata oranı, p95/p99, Supabase bağlantıları, Redis gecikmesi ve CPU/bellek kaydedilir. Bir kademe SLO'yu aşarsa sonraki kademe başlatılmaz.

```powershell
$env:LOAD_TEST_URL='https://staging.example.com/kesfet'
$env:LOAD_TEST_REQUESTS='10000'
$env:LOAD_TEST_CONCURRENCY='250'
pnpm test:load
```

“Milyon kullanıcıya hazır” ifadesi yalnızca gerçek trafik profili, autoscaling sınırları, kota artışları ve bu kademeli testlerin sonuçlarıyla doğrulanabilir.

## WAF ve CDN asgari kuralları

- `/api/bookings`, auth, favori, yorum ve geocode uçlarında IP/hesap bazlı bot oranı; uygulama içi limiter ikinci savunma katmanıdır.
- Bilinen kötü botlar ve anormal ülke/ASN artışları challenge edilir; sağlık uçları challenge dışında fakat yalnızca GET'e açıktır.
- Statik Next varlıkları immutable cache, HTML kısa cache/stale-while-revalidate, kullanıcıya özel yanıtlar `private/no-store` kullanır.
- Origin yalnızca CDN/load balancer'dan gelen trafiğe sınırlandırılır.

## Anahtar rotasyonu

Service-role, Redis, cron, log-drain ve mesaj sağlayıcı anahtarları en az 90 günde bir ve her olay şüphesinde döndürülür. Yeni anahtar eklenir, deploy edilir, sağlık/worker testi yapılır, sonra eski anahtar iptal edilir. Anahtarlar kaynak koduna veya loglara yazılmaz.
