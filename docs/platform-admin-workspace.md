# Genel yönetici çalışma alanı

Kapsam: işletme paneli değil, `/admin` platform yönetimi. Müşteri sitesi veya native işletme paneline platform yetkisi eklenmez. Genel adminin responsive web ekranı ayrı test edilir; native müşteri önizlemesi bu ekran değildir.

## Operatör akışı

1. Genel bakışta onay bekleyen işletmeleri veya bekleyen/işaretli yorum kuyruklarını aç.
2. İşletmelerde ad/telefon/kısa adres/tam kimlik, durum, şehir, doğrulama, kategori ve kayıt tarihiyle daralt. Kategori kapsamı Kategoriler → kaydı incele → bu kategorideki işletmeler bağlantısından açılır.
3. Kullanıcılarda ad/telefon/tam kimlik, profil rolü, şehir, tarih ve silinmiş hesap görünürlüğüyle daralt. Profil rolü işletme/şube üyeliği değildir.
4. Sayfa başına 25/50/100 kayıt seç. Sonraki/önceki/ilk sayfa filtreleri korur. Seçili kayıt detayı küçük ekranlarda listeden önce, geniş ekranlarda yanında açılır. Detayda sıradaki kayda ve ilgili randevu/yorum/işlem geçmişine geçilir.
5. İşletme yayın/doğrulama, yorum moderasyonu, korumasız profil rolü ve kategori düzenleme işlemlerini ayrı onay penceresinde incele. Başarılı işlem sonrası listeyi yenile; belirsiz sonuçta işlemi tekrar göndermeden güncel kayıt ve geçmişi kontrol et.

## Veri ve erişim sınırları

- Her SSR isteğinde ve her Server Action çağrısında cookie oturumu Auth ile doğrulanır; silinmemiş `ADMIN` profil gerekir. Service-role anahtarı veya tarayıcıdan gelen rol kullanılmaz. Mevcut RLS ve veritabanı RPC yetki denetimleri korunur.
- Yalnız açık bölüm sorgulanır. Genel bakış dört HEAD count; dizin en fazla sayfa boyutu + 1 satır ve ayrı filtreli HEAD count kullanır. Seçili kayıt bağımsız tek kimlikle okunur. İşletme konum dizisi en fazla üç satırdır; daha fazla şubeyi tam şube listesi gibi sunmaz.
- Tarih + UUID (kategori için sıra + UUID; audit için tarih + bigint) keyset sayfalama, derin offset veya ilk 1.000 satır sınırına dayanmaz. Mikrosaniye timestamp ve bigint hassasiyeti korunur. Cursor bölüm/filtre/sayfa boyutuna bağlıdır; erişim yetkisi değildir.
- Liste güncel canlı okumadır, snapshot değildir. Eşzamanlı düzenleme/silme/ekleme toplamı ve sıralamayı değiştirebilir. Kesin toplam okumak veri büyüklüğüne göre maliyetlidir; milyonlarca satır/eşzamanlı operatör kapasitesi staging ölçümü ve sorgu planı olmadan iddia edilmez.
- Audit ekranı kimlik, işlem, yapan kişi ve zaman metadata'sını gösterir; ham before/after JSON, IP ve user-agent dökmez. İşletme, profil rolü ve yorum RPC'leri mevcut audit kaydını üretir. Mevcut kategori upsert RPC'si audit üretmez; onay ekranında bu sınırlama yazılıdır.
- Kendi hesabı, mevcut ADMIN veya silinmiş hesabın rolü UI/Server Action üzerinden değiştirilmez; yeni ADMIN atama seçeneği yoktur. Eski veritabanı admin rolü RPC sözleşmesi bu teslimatta değiştirilmedi: bu, doğrudan DB çağrılarına yeni bir last-admin politikası eklendiği anlamına gelmez.
- İşletme/kullanıcı/yorum için işlemden önce bilinen eski durum kontrolü yapılır. Bu kontrol RPC ile tek transaction içinde CAS değildir; eşzamanlı iki yönetici için atomik sürüm/idempotency garantisi yoktur. Bu nedenle toplu askıya alma, toplu yetki verme ve toplu silme sunulmaz. Bunlar ayrı atomik, denetimli DB sözleşmesi gerektirir.
- Kategori upsert eski tek kayıt sözleşmesini kullanır; CAS/idempotency/audit açığı kapatılmış sayılmaz. Bu sürümde canlı DB migration uygulanmadı, müşteri/randevu/ödeme/test kaydı oluşturulmadı.
- Yönetici istemcisinde veri isteği 10 saniyeyle sınırlı ve SDK otomatik tekrarları kapalıdır; diğer SSR okuma bütçeleri değişmez. Yazımda ayrıca fail-closed oran sınırlaması, sıkı alan doğrulama, RPC yanıt kontrolü, hydration kilidi ve onay vardır. Belirsiz hata başarı/boş liste/sıfır toplam gibi gösterilmez.

## Doğrulama

- Sorgu doğrulama, tek OR ağacıyla literal arama + seek, Türkçe/ASCII şehir, filtreli gerçek toplam, geri sayfalama, bigint ve mikrosaniye; gerçek Supabase query builder URL testleri.
- Yerel PGlite/Postgres üzerinde **10.037 sentetik kayıt**: eşit timestamp'ler, 101 sayfa, ileri/geri geçişte atlama/tekrar olmaması ve filtreli toplam. Bu test canlıya veri eklemez ve yük/kapasite testi değildir.
- Yetki sınırı: anonim, müşteri, sahip, işletme yöneticisi, çalışan, silinmiş admin ve doğrulanamayan Auth/DB hata testleri. İşlem doğrulama: eski durum, kendine/ADMIN'e rol, oran sınırlayıcı arızası, sahte/tekrarlı alan, bozuk RPC yanıtı ve otomatik yazım tekrarı olmaması.
- SSR bölüm tembelliği, hatada sahte boş liste olmaması, yetkisiz URL'lerin girişe yönlenmesi; genel admin korumaları CI web hedeflerine eklendi.
- İsteğe bağlı `SALONNY_VERIFY_ADMIN_POSTGREST=1 pnpm test tests/admin-directory-live.test.ts`: yalnız sınırlandırılmış anonim public işletme/kategori okumalarıyla canlı PostgREST grammar kontrolü. Bu test gerçek ADMIN JWT kabulü veya özel dizin/gerçek yazım kabulü değildir.
- Sentetik görsel kontrol `SALONNY_ADMIN_VISUAL_FIXTURE=1 pnpm test tests/admin-page.test.tsx` ile yalnız gitignored `artifacts/admin-qa/index.html` üretir. Üretim route/auth bypass veya uygulamanın yerine demo backend eklenmez.

## Ayrı kalan kabul

Gerçek ADMIN oturumunda tüm özel dizinlerin RLS/ilişki okumaları ve staging üzerinde rol/yayın/moderasyon/kategori yazımları; iki yöneticiyle yarış/idempotency, büyük veri sorgu planları ve izinli eşzamanlı yük testi ayrı kapıdır. Üretim kullanıcılarına bu testler için işlem uygulanmaz. Bu teslimat tüm ürünün veya yüksek trafikli genel yayının GO kararı değildir.

## 20 Ekim yerel sonuçları

- Son tam birim/API/SSR koşusu: **1.242 başarılı / 2 isteğe bağlı ağ atlaması**, 85 dosya (bir uzak test dosyası tümden atlanır). Son hedef koşu **72/72**. Lint, web/native tip ve production build başarılı. Bağımlılık güvenlik kapısı geçti; yeni bağımlılık eklenmedi.
- Ayrı canlı public grammar kontrolü **1/1** geçti: sınırlı anonim işletme/kategori araması, şehir inner join, noktalama ve toplam doğrulandı; özel kayıt okunmadı ve yazım yapılmadı.
- İlk yerel sentetik UI kontrolü 390 px'de belge taşmasını buldu: tablo içindeki sr-only mutlak konumlu başlığın clip containing block'u sabitlendi. Düzeltme sonrası **390×844, 812×375, 1280×800, 1920×1080** ve gerçek istemci onay bileşeniyle toplam **5/5** geçti. Vazgeçme/Escape odağı, hata sonrası taslak, pending çift tıklamada tek çağrı ve başarı kilidi yalnız yerel sahte yanıtla test edildi. Kanıtlar gitignored `artifacts/admin-qa/` içindedir; canlı kabul değildir.
- İlk yeni giriş regresyonlarında global alert seçicisi boş Next route announcer'ını da bulduğu için iki desktop testi başarısızdı. Seçici yalnız form hata kutusuna daraltıldı; gizli servis metninin gösterilmemesi, taslağın kalması ve etkin kontrol beklentileri kaldırılmadı. Son temiz tam web koşusu **93 başarılı / 15 koşullu atlama**, retry/flaky yok; 13 platform koşulu + 2 canlı rezervasyona uygun işletme bulunamayan senaryo atlaması. Önceki başarısız koşu başarılı sayılmaz. Son test sözleşmesiyle ayrıca adminin desktop + responsive web kapısı **20/20** geçti.
- Temiz CI Supabase ayarı içermez: admin giriş testi bu durumda açık yapılandırma hatası, korunmuş taslak ve **sıfır auth isteği** arar. Yapılandırılmış koşuda token isteği browser'da tutulur, 400/503 mesajları ve tam bir istek zorunludur. Sentetik e-posta/şifre gerçek projeye gönderilmez.
- Yönetici girişinde hydration öncesi kapalı alanlar + POST yöntemi, yakalanan ağ hataları ve silinmiş ADMIN yönlendirme döngüsü koruması eklendi. Mevcut kullanıcı rolleri veya veritabanı izinleri değiştirilmedi.

GitHub/Netlify ve temiz CI son kabulü aşağıya ayrı kaydedilir; yerel sonuçlar tek başına yayımlandı sayılmaz.
