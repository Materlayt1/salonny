# Müşteri kuponları

11 Ekim 2026. Kod ve izole testler hazır; `202610110032_customer_coupons.sql` canlı etkinleştirmesi ayrıca onay gerektirir. Altyapı eksikken API indirim uygulanmış gibi başarı bildirmez.

## Davranış

- Web ve native işletme detayında geçerli kod ve indirim koşulu gösterilir. Duyuru uygunluk garantisi değildir; hesap ve seçili hizmet/şube/uzman özel olarak kontrol edilir.
- Randevunun onay adımında kupon girilir, uygulanır veya kaldırılır. Uygulanmamış kodla randevu gönderilemez. Hizmet/uzman değişince indirim sıfırlanır; terk edilen seçimin geç ağ yanıtı yeni seçime taşınmaz.
- Kod baştaki/sondaki boşluklardan temizlenir, büyük harfe çevrilir; 3–30 ASCII harf/rakam, tire ve alt çizgi kabul edilir.
- Her müşteri aynı işletmedeki aynı kodu yalnız bir kez kullanabilir. Hem oturum hesabı hem işletmenin müşteri kaydı için benzersiz kullanım kaydı tutulur. Kodun sonradan silinip yeniden oluşturulması aynı kodun hakkını yenilemez. Bu, farklı hesap ve farklı müşteri kayıtları üzerinden gerçek kişi kimliğinin doğrulandığı anlamına gelmez.
- Kullanım başarılı randevu oluşturmayla aynı transaction'da tüketilir; hata/çakışma tüm işlemi geri alır. İptal edilen randevu kupon hakkını yenilemez. Aynı işlem anahtarıyla tekrar, süre sonradan dolsa bile kayıtlı sonucu döndürür; ikinci randevu/kullanım oluşturmaz.
- Yüzde indirim kuruş cinsinden aşağı yuvarlanır; sabit indirim hizmet tutarını aşmaz. Sunucu çalışan fiyatı, şube fiyatı ve temel hizmet fiyatını bu öncelikle kullanır. Son tutar gerçek kaydedilen randevudan hesaplanır; istemci tutarı alınmaz. Online ödeme eklenmedi.

## Hedef kitle tanımları

Bu sürümde kampanya uygunluğu aynı işletmedeki oturum hesabının tamamlanan randevularına dayanır:

- `all`: tüm müşteriler.
- `new`: henüz tamamlanmış randevusu olmayanlar.
- `loyal`: en az beş tamamlanmış randevusu olanlar.
- `inactive`: son tamamlanmış randevusu en az 90 gün önce olanlar; hiç tamamlanmış randevusu olmayanları kapsamaz.

Bu eşikler yeni kupon davranışının tanımlarıdır; eski rapor/CRM segmentlerinin eşleştiği varsayılmaz. Kamuya açık duyurularda koşul yazılır.

## Güvenlik ve kurulum

`list_business_coupons` yalnız yayınlanan işletmenin en fazla 20 güncel kuponunun kod/tür/değer/son tarih/hedef kitlesini açar; müşteri bilgisi açıklamaz. `quote_customer_coupon` ve `create_appointment_with_coupon` doğrulanmış oturum ister. Kullanım defteri RLS ve kapalı tablo haklarıyla doğrudan istemci erişimine kapalıdır. Kod, kota ve kullanım hakları sunucuda yeniden kontrol edilir; kampanya/kupon kilitleri ve benzersiz kısıtlar seri kullanımı korur.

Migration mevcut veriyi silmez. Aynı işletmede normalize edilince yinelenen eski kod varsa transaction durur; hangi kodun korunacağı ayrıca belirlenmelidir. `customer_coupons_deployment_verify.sql` sekiz salt-okunur kurulum/ACL denetimi içerir. Migration geçmişine 032 kaydı başarıdan sonra aynı SQL transaction'ında eklenmelidir.

## Doğrulama sınırları

- `tests/customer-coupons.test.ts`: 14 sözleşme/API testi; sunucu tutarı, scope, anonim erişim, güvenli hata, limit ve bozuk sonuç yolları.
- `scripts/test-coupon-engine.mjs`: 32 izole PostgreSQL/WASM kontrolü; sekiz katalog kontrolü, tek kullanım, replay, kota, rollback, iptal, süre ve hedef kitle koşulları. Temel randevu motoru fixture'dır; gerçek Supabase JWT/RLS, gerçek müsaitlik veya eşzamanlı trafik kabulü değildir.
- `e2e-mobile/customer-coupons.spec.ts`: kontrollü native duyuru, uygulama/özet/istek, kullanılmış kod, seçim değişimi ve geç quote yanıtı senaryoları.

Gerçek müşteri/randevu yazımı test amacıyla yapılmadı. Staging'de ayrı müşteri hesaplarıyla gerçek randevu/RLS/kota/yarış kabulü ve physical cihaz testleri yayın öncesi açık kalır.
