export type AuthFormMode = "login" | "signup";
export type AuthFormField = "fullName" | "email" | "password" | "consent";
export type AuthFormErrors = Partial<Record<AuthFormField, string>>;
export const signupPasswordMinimum = 8;

export function validateAuthEmail(value: string): string | undefined {
  if (!value.trim()) return "E-posta adresini gir.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) return "Geçerli bir e-posta adresi gir. Örnek: ad@ornek.com";
  return undefined;
}

export function validateAuthForm(mode: AuthFormMode, values: { fullName: string; email: string; password: string; accepted: boolean }): AuthFormErrors {
  const errors: AuthFormErrors = {};
  const emailError = validateAuthEmail(values.email);
  if (emailError) errors.email = emailError;
  if (!values.password) errors.password = "Şifreni gir.";
  else if (mode === "signup" && values.password.length < signupPasswordMinimum) errors.password = "Şifren en az 8 karakter olmalı.";
  if (mode === "signup") {
    if (values.fullName.trim().length < 2) errors.fullName = "Adını ve soyadını gir (en az 2 karakter).";
    if (!values.accepted) errors.consent = "Devam etmek için kullanım koşullarını ve KVKK metnini onayla.";
  }
  return errors;
}
