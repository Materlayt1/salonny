# 031/032 canlı kurulum kabulü

11 Ekim 2026. Kullanıcının iki migration için açık onayıyla Salonny Supabase projesi `inkybypxpqqoajufhdol` üzerinde uygulandı. Ödeme, SMS, test randevusu, müşteri/kupon/çalışma planı oluşturma veya değiştirme kapsam dışı tutuldu.

## Uygulama ve kurulum kanıtı

- Ön kontrol: tenant dışı şube ataması, atamasız/geçersiz tarihli çalışma dönemi, atamasız açık randevu ve normalize edilmiş mükerrer kupon kodu bulunmadı. Temel randevu motorunun dokuz parametreli imzası mevcut kaynakla eşleşti; 031/032 henüz kurulu değildi.
- `202610110031_native_staff_schedules` ve `202610110032_customer_coupons` sırayla başarıyla uygulandı; her migration kendi transaction'ında geçmişe kaydedildi. Migration'lar yeniden çalıştırılmadı.
- `supabase/tests/native_staff_schedules_deployment_verify.sql`: **12/12 PASS**. İşlev ACL'leri, ham çalışma saati tablo/kolon yazımı yasağı, okuma/RLS, tenant/atama/tarih kısıtları, dört tetikleyici ve aktif randevu indeksi.
- `supabase/tests/customer_coupons_deployment_verify.sql`: **8/8 PASS**. Public yalnız duyuru işlevi, korumalı quote/booking RPC, kapalı kullanım defteri/RLS, üç tek kullanım kısıtı, dört FK ve normalize kod indeksi.
- `supabase/tests/native_staff_coupons_source_verify.sql`: **14/14 PASS**. On iki canlı işlev gövdesi ve iki tam migration geçmişi kaynağı repo ile eşleşti. MD5 burada aktarım/drift kontrolüdür; kriptografik kaynak kimliği garantisi değildir.
- Mevcut sekiz tablonun kayıt sayıları ön kontroldeki sayılarla aynı kaldı; yeni kullanım defterinde kayıt oluşturulmadı. Sayım, satır içeriklerinin tamamının kriptografik karşılaştırması değildir.

İlk migration-geçmişi aktarımında JavaScript replacement-string dollar dönüşümü yalnız saklanan kaynak literalini değiştirdi; uygulanan işlevlerin 12/12 eşleşmesi zaten başarılıydı. Yalnız bu tur oluşturulan iki geçmiş kaydı, eski hash ve satır sayısı koruması ile tek transaction'da exact LF kaynak metnine düzeltildi. Base64 decode kaynak metnini korudu; beklenen hashler değiştirilmedi. Son 20+14 denetim tekrar başarılı; şema/işlev/müşteri kayıtları bu metadata düzeltmesinde değişmedi. Sonraki aktarım araçları string replacement callback veya güvenli kaynak kodlaması kullanmalı.

## Gerçek, salt-okunur API ve arayüz kabulü

- Yerel public işletme API'si: **200**, mevcut iki gerçek Gogo işletmesi korunuyor.
- İki public kupon API çağrısı: **200**; mevcut geçerli kampanya bir işletmede listelendi, diğerinde aktif kupon yok.
- Geçerli biçimde oturumsuz ileri vardiya GET ve kupon quote POST: **401**.
- Doğrudan Supabase anonim kupon kullanım tablosu GET, vardiya hazır RPC ve kupon quote RPC: **401**.
- Gerçek Gogo detayında mevcut %10 kuponun kodu, son tarihi ve müşteri başına tek kullanım açıklaması localhost'ta ve Vercel önizlemesinde görüldü.
- Mevcut localhost hesabıyla gerçek hizmet/mevcut kod için yalnız quote doğrulandı: **₺400 → ₺40 indirim → ₺360 toplam**. Kullanım hakkı tüketilmedi; koşul checkbox'ı veya son randevu onayı gönderilmedi.
- Vercel CLI istekleri deployment protection nedeniyle SSO'ya yönlendi. Yetkili tarayıcıdan gerçek duyuru doğrulandı; CLI'deki HTML 200 yanıtı JSON API kabulü sayılmadı. Yeni bir giriş/parola işlemi yapılmadı.

Bu turun kendi kabulü yukarıdaki canlı, salt-okunur kontrollerdir. `55813ea` kod kapısındaki 484 birim testi, 031 için 29 / 032 için 32 izole SQL kontrolü, 125/125 mobil E2E ve platform export/build sonuçları önceki kod koşusudur; native kod değişmediği için yeniden çalıştırılmış diye sunulmaz. İki GitHub kalite koşusu ve Vercel dağıtımı bu kaynak commit'i için başarılıdır.

## Açık kabul kapıları

Gerçek yetkili vardiya yazımı, ayrı müşteri hesaplarıyla randevu/ikinci kullanım, RLS/IDOR, kupon kota yarışı, booking/unlink yarışı ve gerçek staging yükü henüz kabul edilmedi. Fiziksel cihaz, imzalı mağaza paketi, production Redis/readiness, yedek/geri yükleme ve alarm kapıları da açıktır. Bu kurulum tek başına genel production GO veya binlerce eşzamanlı trafik garantisi değildir.

Güncel sıra: [ileri panel yapılacaklar](advanced-panel-todo.md), sonraki kod özelliği #4 gerçek rapor özeti/grafikleri.
