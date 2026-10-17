# Web/native işletme özeti ve rapor doğruluğu

17 Ekim 2026. Bu belge kod davranışını tanımlar; üretim kapasitesi veya genel güvenlik onayı değildir.

## Ortak veri kapsamı

- Web SSR ve native panel API'si `lib/business-panel-read.ts` kullanır. İşletme ve seçili aktif şube doğrulanmış bağlamdan gelir.
- Çalışan randevuları yalnız kendisine atanmış kayıtlarla sınırlıdır; sıfır/birden fazla aktif çalışan eşleşmesinde ilk kayıt seçilmez, erişim reddedilir.
- Müşteri görünürlüğü kapalıyken isim/telefon ilişkisi; finansal görünürlük kapalıyken tutar/para birimi sorguya eklenmez. Dönen DTO da bu alanları dışarıda bırakır.
- Bugünün randevu toplamı tüm durumları kapsar; vitrinde ilk 8, yaklaşan listede ilk 5 bekleyen/onaylı kayıt gösterilir. Native tam gün bağlantısı takvime açılır. Bunlar sınırsız liste değildir.
- Hizmet ve çalışan adetleri seçili şubeye aittir. İzinli müşterilerin toplam kartı açıkça **İşletme müşterileri** olarak etiketlenir, şube toplamı iddia edilmez.
- Yerel gün aralığı şube saat diliminde hesaplanır; UTC gece yarısı veya sabit 24 saat değildir. Native takvimde Bugün de şube saat dilimini kullanır.
- Okuma veya toplam metadata hatası gerçek hata ekranıdır; sahte sıfır özet oluşturulmaz.

## Rapor tanımları

- Web/native mevcut `native_business_report` motorunu kullanır. Ham, sayfa sınırına takılmış randevu listesinden dönem toplamı çıkarılmaz.
- Son 7/30/90 **tamamlanmış yerel gün**, bugün hariç; eşit uzunluktaki önceki dönemle karşılaştırılır. Raporun takvim saat dilimi işletmenindir, kartta gösterilir; dashboard bugünü şubenindir.
- Tamamlanan randevu tutarı tahsilat/ödeme değildir. Para birimleri ayrı kalır; büyük tutarlar `BigInt` ile kesin biçimlenir. Önceki dönem sıfırsa yüzde değişim hesaplanamaz denir.
- Hizmet kırılımı hizmet katılım sayısıdır. Çok hizmetli randevu tutarı ilk hizmete yazılmaz; hizmet tutarı paylaştırılmamıştır.
- Kırılım 25 grup halinde sayfalanır; özet ve günlük seri bütün dönemden hesaplanır. Parametreler sunucuda doğrulanır.
- Doluluk geçmiş performans iddiası değildir: bugün hariç gelecek 7 tam günün mevcut vardiya, mola ve izinler üzerinden planıdır. Plan dışı dakikalar uyarıdır; kaynak kapasitesi ya da müşteriye açık saat garantisi değildir.
- CSV, tüm seçili dönemin günlük agregasyonudur. Gün başına bir satır ve para birimi başına ayrı sütun vardır; adetler para birimleri için çoğaltılmaz. Tek tek müşteri/randevu/iletişim verisi içermez.
- Rapor yetkisi ve finansal görünürlük birlikte gerekir. Sadece rapor RPC'si sunucu istemcisinde 12 saniye bütçe kullanır; genel veritabanı okumaları 2 saniye olarak kalır.

## Doğrulama ve kalan kapılar

Takvim/DST, kapsam, minimum SELECT alanları, eksik toplam, hata durumları, kesin para ve CSV, SSR rapor ve dashboard için otomatik testler eklendi. Native şube değişimi, tam gün bağlantısı, hata ekranı ve farklı saat diliminde Bugün senaryoları eklendi.

Ham Supabase tablo politikaları bu düzenlemeyle değiştirilmedi (**QA-05 açık**). 038 kuralları ayrı kullanıcı onayıyla canlıya uygulandı ve `cfcdff8` commit'inde tutuldu; bu dashboard düzenlemesiyle aynı özellik değildir. 14 katalog/yetki, 10 işlev gövdesi ve tam kaynak geçmişi doğrulandı; işletme/müşteri/randevu sayıları 2/2/8 kaldı. Ayrı gerçek sahip/yönetici/çalışan JWT hesaplarıyla canlı kabul, fiziksel cihaz ve gerçek yazım/yarış testleri bu mock/SSR testlerinden çıkarılamaz. Ödeme, SMS, gerçek müşteri veya test randevusu oluşturulmaz.
