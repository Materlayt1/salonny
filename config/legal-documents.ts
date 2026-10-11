import { BRAND } from "@/config/brand";
export type LegalDocument = { title: string; updated: string; sections: { title: string; paragraphs?: string[]; bullets?: string[] }[] };
// Existing web drafts, shared verbatim with the native reader; not legal approval.
export const LEGAL_DOCUMENTS: Record<"privacy" | "kvkk" | "terms", LegalDocument> = {
  privacy: { title: "Gizlilik Politikası", updated: "18 Ağustos 2026", sections: [
    { title: "Topladığımız bilgiler", paragraphs: [`Hesap, iletişim, konum, randevu, ödeme durumu ve platform kullanım bilgilerini hizmeti sunmak amacıyla işleriz. Kart verileri ${BRAND.name} sunucularında tutulmaz; yetkili ödeme sağlayıcısı tarafından işlenir.`] },
    { title: "Kullanım amaçları", bullets: ["Rezervasyonların oluşturulması ve yönetilmesi", "Güvenlik, dolandırıcılık önleme ve yasal yükümlülükler", "Açık rıza bulunduğunda kampanya ve kişiselleştirme"] },
    { title: "Haklarınız", paragraphs: ["Verilerinize erişim, düzeltme, silme, dışa aktarma ve işleme itiraz haklarınızı profil veya destek kanalı üzerinden kullanabilirsiniz."] },
  ] },
  kvkk: { title: "KVKK Aydınlatma Metni", updated: "18 Ağustos 2026", sections: [
    { title: "Veri sorumlusu", paragraphs: [`6698 sayılı Kişisel Verilerin Korunması Kanunu kapsamında veri sorumlusu ${BRAND.legalName}'dir. Bu metin üretim öncesinde hukuk danışmanı tarafından doğrulanmalıdır.`] },
    { title: "İşleme hukuki sebepleri", paragraphs: ["Veriler; sözleşmenin kurulması ve ifası, hukuki yükümlülük, meşru menfaat ve gerekli durumlarda açık rıza hukuki sebeplerine dayanılarak işlenir."] },
    { title: "Başvuru", paragraphs: ["KVKK’nın 11. maddesindeki haklarınıza ilişkin başvurularınızı kimlik doğrulamasıyla destek kanalımıza iletebilirsiniz."] },
  ] },
  terms: { title: "Kullanım Koşulları", updated: "18 Ağustos 2026", sections: [
    { title: "Platformun rolü", paragraphs: [`${BRAND.name}, müşteriler ile bağımsız hizmet işletmelerini buluşturan rezervasyon ve yönetim platformudur. Hizmetin ifasından ilgili işletme sorumludur.`] },
    { title: "Rezervasyon ve iptal", paragraphs: ["İşletmeye özel fiyat, depozito ve iptal koşulları ödeme/onay adımında gösterilir. Kullanıcı, onaylamadan önce bu koşulları incelemekle yükümlüdür."] },
    { title: "Hesap güvenliği", paragraphs: ["Kullanıcılar hesap bilgilerinin gizliliğinden ve hesapları üzerinden gerçekleşen işlemlerden sorumludur."] },
  ] },
};
