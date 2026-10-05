# Yerel bağımlılık güvenlik yamaları

5 Ekim 2026 taraması Expo araç zincirinde iki yeni/advisory güncellemesi buldu. Her ikisi için npm'de yayımlanmış bir düzeltilmiş sürüm bulunmadığı için `pnpm patchedDependencies` ile dar kapsamlı yerel yamalar uygulanmıştır. Paket sürüm numarası aynı kaldığından ham `pnpm audit --prod` bu iki kaydı göstermeye devam eder.

- [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv), `node-forge@1.4.0`: RSA PKCS#1 v1.5 DigestInfo içindeki DigestAlgorithm dizisinde fazladan öğeler ve geçersiz parametre türleri reddedilir. Standart imzalar kabul edilmeye devam eder. Yama `patches/node-forge@1.4.0.patch` içindedir.
- [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), `braces@3.0.3`: hem metin ayrıştırıcısında hem hazır AST alan compile/expand/stringify yollarında derinlik sınırı uygulanır; döngülü AST de reddedilir. Normal glob ve range örnekleri çalışmaya devam eder. Yama `patches/braces@3.0.3.patch` içindedir.

`pnpm test:security` önce npm advisory raporunu okur, sonra **kurulu gerçek paketlere** regresyon testleri uygular. Yalnız yukarıdaki tam advisory/paket/sürüm eşleşmeleri ve geçen regresyon testleri yerel olarak giderilmiş kabul edilir. Yeni bir advisory, beklenmeyen paket sürümü, eksik/etkisiz yama veya tarama servis hatası kalite kapısını durdurur. Global advisory ignore listesi kullanılmaz.

Regresyonlar bozuk DigestAlgorithm yapılarıyla üretilmiş imzaları, geçerli imzayı, 4.000 seviye iç içe metinleri, hazır derin AST'leri ve normal glob genişletmelerini kapsar. Yayımlanmış upstream düzeltmeler geldiğinde paketler yükseltilip yerel yamalar kaldırılmalıdır. Bu yamalar uygulama/API yetkilendirmesinin yerine geçmez.
