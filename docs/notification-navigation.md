# Bildirimden ilgili ekrana geçiş — 14 Ekim 2026

Mobil bildirim kartları artık yalnız okundu işaretlemez. API, mevcut `appointment_id` / `business_id` ilişkilerini ve RLS ile erişilebilen şube/işletme slug bilgisini taşır. Migration veya geçmiş bildirimleri yeniden yazma gerekmemiştir.

- Müşteriye gelen onay/talep/iptal/saat değişikliği/durum/hatırlatma/değerlendirme bildirimi ilgili native `/appointment/:id` ekranını açar. Okunmuş bildirim de açılır.
- İşletmeye gelen `new_appointment`, `appointment_cancelled_by_customer`, `appointment_rescheduled_by_customer`, native işletme randevularında açık işletme/şube ve tek randevu filtresiyle açılır. Filtre kaldırılarak normal listeye dönülür. İşletme sahibinin kendi müşteri randevusu işletme bildirimi sayılmaz.
- Kampanya bildirimi bağlı işletmenin native sayfasına gider; işletme bağlantısı yoksa keşfet açılır.
- Eski/bağlantısız randevu bildirimi randevular listesine gider. Silinmiş veya yetki dışı randevuda güvenli listeye dönüş sunulur; başka randevu yerine gösterilmez.
- Webde kartlar klavye ile erişilebilir gerçek iç bağlantıdır. Müşteri randevusu kendi listesinden odaklanır; tamamlanmış/iptal edilmiş kayıt diğer sekmede gizlenmez. İşletme bildirimi yetki kontrollü, açık kapsamlı tek randevu görünümünü açar; bu web görünümü salt okunurdur. Genel web panelinin mevcut işletme seçicisi bu değişiklikte yeniden yapılmamıştır.

Okundu işlemi ekran açılmasını bekletmez. Okundu isteği hata verdiğinde mobilde engelleyici uyarı açılmaz; bildirim dönüşte okunmadı kalır ve yeniden denenebilir. Tümünü okundu işlemi ayrı ve hata görünürdür. Boş `ids: []` artık yanlışlıkla bütün bildirimleri okundu işaretlemez.

## Güvenlik ve test sınırı

Hedefler ortak sözleşmede yalnız bilinen iç yollardan kurulur. Bildirim JSON'undaki URL, `javascript:`, dış adres veya metinden çıkarılmış kimlik navigasyonda kullanılmaz. Liste ve okundu işlemi mevcut kullanıcıya bağlıdır. İşletme detayı mevcut üyelik, şube, takvim yetkisi ve çalışan-kendi-randevusu kısıtlarını korur. Webde müşteri görünürlüğü ve mali görünürlük sunucuda maskelenir. Native parametre üretimi tarayıcıya özgü `URLSearchParams.size` özelliğine dayanmaz.

14 Ekim doğrulaması: **764/764 birim testi**, web/native tip kontrolü, lint ve güvenlik denetimi; Next.js production build ve temiz mobil preview export başarılı. İlk yoğun export ile paralel sınırsız-worker birim koşusunda mevcut readiness fixture'ı 5 saniye süreç zaman aşımına takıldı; son tam koşu iki worker ile 764/764 geçti. Üretim servisine trafik/yük testi yapılmış sayılmaz.

Bu testlerde kontrollü API oturumları kullanılır. Canlı müşteri/randevu/bildirim yazımı, SMS, ödeme veya sistem push bildirimi yapılmaz. Telefon kilit ekranı/push tıklaması ve fiziksel iOS/Android kabulü bu değişikliğin kapsamında değildir.

Son mobil regresyon: temiz `entry-1eb950a36469fec33c82a1745b233017.js` export'u üzerinde **19/19**, skip/retry yok. Bildirim geçişleri yanında randevu iptal/erteleme/değerlendirme/oluşturma ve profil-okundu akışları tekrar geçti. Bellekte kalan panelde başka işletme bildirimi, şubeli ve şubesiz iki girişte de doğru kapsamı seçti.

Webde gerçek public randevu akışı masaüstü ve mobil tarayıcıda **2/2** salt-okunur regresyondan geçti. Yetkili web bildirim görünümü ve kapsam/mali maskeleme kontrollü sunucu-render testleriyle doğrulandı; bu kayıt gerçek hesapla son kullanıcı kabulü değildir.
