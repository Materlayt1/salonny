export type AuthMode = "signin" | "signup";

export function authErrorMessage(code: string | undefined, mode: AuthMode) {
  if (code === "invalid_credentials") return "E-posta veya şifre hatalı.";
  if (code === "email_not_confirmed") return "Devam etmek için önce e-posta adresini doğrulamalısın.";
  if (code === "user_already_exists" || code === "email_exists") return "Bu e-posta adresiyle daha önce hesap oluşturulmuş.";
  if (code === "over_email_send_rate_limit") return "Doğrulama e-postası limiti doldu. Test e-posta servisi saatte 2 gönderimle sınırlı; yaklaşık bir saat sonra tekrar dene veya özel SMTP kullan.";
  if (code === "email_provider_disabled") return "E-posta ile giriş geçici olarak kullanılamıyor. Lütfen daha sonra tekrar dene.";
  if (code === "weak_password") return "Daha güçlü bir şifre seçmelisin.";
  return mode === "signin"
    ? "Giriş şu anda tamamlanamadı. Lütfen tekrar dene."
    : "Kayıt şu anda oluşturulamadı. Lütfen tekrar dene.";
}
