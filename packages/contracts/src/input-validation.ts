import { canonicalCity } from "./browse-area";
import { validBookingPhone } from "./booking-policy";

// Keyboard hints are not validation: these rules are shared by native, web and API.
export function phoneInput(value: string) {
  const allowed = value.replace(/[^0-9+ ().-]/g, "");
  return `${allowed.startsWith("+") ? "+" : ""}${allowed.replace(/\+/g, "")}`.slice(0, 24);
}
export function postalCodeInput(value: string) { return value.replace(/[^0-9]/g, "").slice(0, 5); }
export function personNameInput(value: string) { return value.replace(/[^\p{L}\p{M} .'’\-]/gu, "").slice(0, 120); }
export function validPersonName(value: string) {
  const text = value.trim();
  return text.length >= 2 && text.length <= 120 && /\p{L}/u.test(text) && /^[\p{L}\p{M} .'’\-]+$/u.test(text);
}
export function validOptionalPhone(value: string) { return !value.trim() || validBookingPhone(value); }
export function validPostalCode(value: string) { return !value.trim() || /^[0-9]{5}$/.test(value.trim()); }
export type ProfileDraft = { fullName: string; phone: string; city: string };
export function profileErrors(value: ProfileDraft) {
  const errors: Partial<Record<keyof ProfileDraft, string>> = {};
  if (!validPersonName(value.fullName)) errors.fullName = "Ad soyad 2–120 karakter olmalı; yalnız harf, boşluk, nokta, kesme ve kısa çizgi kullanılabilir.";
  if (!validOptionalPhone(value.phone)) errors.phone = "Telefon harf içeremez; ülke kodu dahil 10–15 rakam olmalı.";
  if (value.city.trim() && !canonicalCity(value.city)) errors.city = "Türkiye'deki 81 şehirden geçerli bir şehir seç.";
  return errors;
}
