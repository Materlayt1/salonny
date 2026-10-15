# Bildirimden mevcut sayfaya geçiş — 15 Ekim 2026

## 15 Ekim: önceki davranışın yerine geçen düzeltme

Kullanıcının ekran görüntüsündeki yalın randevu detayına otomatik geçiş kaldırıldı. Aşağıdaki güncel eşleme, bu belgenin devamındaki 14 Ekim tarihsel kaydının yerine geçer.

| Bildirim | Native | Web |
| --- | --- | --- |
| Müşteriye onay/talep/durum/iptal/tarih değişikliği/hatırlatma/değerlendirme daveti | Normal Randevularım sekmesi `/appointments` | Normal `/appointments` sayfası |
| İşletmeye yeni randevu, müşteri iptali veya ertelemesi | İşletme/şube kapsamıyla normal `/manage/appointments` listesi | Aynı kapsamla mevcut `/business/appointments` yöneticisi |
| İşletmeye `new_review` | `/manage/reviews` değerlendirme listesi | `/business/reviews` değerlendirme listesi |
| Kampanya/fırsat/indirim | Bağlı işletme, ilişki yoksa Keşfet | Bağlı işletme, ilişki yoksa Keşfet |
| Eski, tipi veya randevu ilişkisi olmayan kayıt | Randevularım | Randevularım |

Müşteri bildiriminde `appointmentId` olsa bile ayrı `/appointment/:id` ekranına veya tek kayıt filtresine gidilmez. Liste kartından isteyerek açılan mevcut randevu yönetimi korunur; iptal, erteleme ve değerlendirme akışları kaldırılmadı. Eski elle açılmış derin bağlantıların güvenli toparlanması korunur.

`new_review` artık “Randevuyu görüntüle” olarak etiketlenmez. Sahip/yöneticiye açık, şubesi randevu ilişkisi üzerinden doğrulanan değerlendirme listesi eklendi. 25 kayıt + bir sonraki sayfa kontrolü kullanır; incelemedeki yorum İncelemede görünür. API salt okunurdur; yeni yanıtlama/yayınlama yetkisi açmaz. Mevcut web raporlarındaki yanıtlama özelliği değişmedi. Çalışana bu yeni liste verilmez; müşteri telefonu, kimliği, randevu notu veya finansal veri taşınmaz.

Mobil bildirim kartlarında ikon, içerik boşluğu, hafif tipografi ve sınırlandırılmış genişlik kullanılır. Okundu işlemi navigasyonu bekletmez; hata alınsa da sayfa açılır. Okunmuş kart da çalışır. Aynı uygulama içi işletme paneli bellekte kalsa bile bildirimdeki işletme/şube yeniden seçilir. Bildirimden açılan web işletme listesinde durum değiştirme isteği de aynı açık kapsamla doğrulanır; kişi/mali görünürlük sunucuda maskelenir.

Hedefler yalnız güvenli iç yollardan kurulur; JSON URL'si kullanılmaz. Veritabanı migration'ı veya geçmiş bildirimleri yeniden yazma gerekmez. Kontrollü testler gerçek müşteri/randevu/SMS/ödeme oluşturmaz. Fiziksel cihaz, sistem push ve gerçek kullanıcı son kabulü ayrı açık kapılardır.

15 Ekim doğrulaması: **96/96 hedefli birim/API/SSR yetki testi**, son temiz `entry-503e4490046bb2ca058b2ba1d3032f98.js` preview export'u üzerinde **22/22 mobil E2E**, retry/skip yok. Listeye geçişler, okunmuş/başarısız okundu isteği, eski referans, doğru işletme/şube, yorum ve kampanya hedefi, uzun içerik taşması ve normal iptal/erteleme/değerlendirme/randevu akışları geçti. Web/native tip kontrolü, tam lint, güvenlik kapısı ve Next.js production build başarılı. Build sırasında başlangıçta yakalanan test tip hatası ve JSX try/catch lint hatası düzeltildikten sonra kapılar yeniden geçti.

Gerçek açık web oturumunda bildirimlerin `/appointments` / kapsamlı `/business/reviews` bağlantıları salt okunur olarak kontrol edildi. Mevcut işletmenin üç değerlendirmesi gerçek veritabanından yeni listede yüklendi; yeni müşteri/randevu/yorum yazılmadı, bildirim okundu alanı değiştirilmedi. Oturumsuz değerlendirme API'si **401**, iki yerel önizleme **200**. Bu kayıt Vercel'de yeni dağıtımın tamamlandığı, fiziksel cihaz veya trafik kapasitesinin doğrulandığı anlamına gelmez.

Mobil görsel kanıtları: `artifacts/notification-lists-final-mobile-20261015/notifications-notification-14daa-ve-a-readable-mobile-layout/` içindeki iki ekran görüntüsü kontrollü test oturumundandır; uygulamaya demo kayıt eklenmemiştir. Web salt-okunur ekran görüntüleri `artifacts/notification-lists-web-20261015.png` ve `artifacts/notification-reviews-web-20261015.png`. Bu yerel kanıtlar Git'e eklenmez.

## 14 Ekim tarihsel kayıt — aşağıdaki eski yönlendirmeler artık kullanılmıyor

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
