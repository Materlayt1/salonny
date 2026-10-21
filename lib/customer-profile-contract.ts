import { z } from "zod";
import { canonicalCity } from "@salonny/contracts/browse-area";
import { validOptionalPhone, validPersonName, validPostalCode } from "@salonny/contracts/input-validation";

const phone = z.string().trim().max(24).refine(validOptionalPhone, "Telefon harf içeremez; ülke kodu dahil 10–15 rakam olmalı.");
const name = z.string().trim().refine(validPersonName, "Ad soyad 2–120 karakter olmalı; sayı veya özel simge içermemeli.");
const city = z.string().trim().max(100).refine((value) => Boolean(canonicalCity(value)), "Türkiye'deki 81 şehirden geçerli bir şehir seç.").transform((value) => canonicalCity(value)!);
const text = (min: number, max: number) => z.string().trim().min(min).max(max).refine((value) => !/[\u0000-\u001f\u007f]/.test(value), "Geçersiz kontrol karakteri.");
export const customerProfileSchema = z.object({ fullName: name, phone, city: z.union([z.literal(""), city]) }).strict();
export const customerAddressSchema = z.object({
  label: text(1, 40), recipientName: name, phone,
  addressLine: z.string().trim().min(5, "Açık adres en az 5 karakter olmalı.").max(300).refine((value) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)),
  city, district: text(1, 100).refine((value) => /\p{L}/u.test(value), "İlçe adı yalnız sayılardan oluşamaz."),
  postalCode: z.string().trim().refine(validPostalCode, "Posta kodu 5 rakam olmalı."), isDefault: z.boolean(),
}).strict();
