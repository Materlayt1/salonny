export type AuthMode = "signin" | "signup";

export function authErrorMessage(code: string | undefined, mode: AuthMode, status?: number) {
  if (code === "service_unavailable" || code === "request_timeout") return "Giriş servisine ulaşılamadı. Bağlantını kontrol edip yeniden dene.";
  if (code === "over_request_rate_limit") return "Çok fazla deneme yaptın. Birkaç dakika sonra yeniden dene.";
  if (code === "invalid_credentials") return "E-posta veya şifre hatalı.";
  if (code === "email_not_confirmed") return "Devam etmek için önce e-posta adresini doğrulamalısın.";
  if (code === "user_already_exists" || code === "email_exists") return "Bu e-posta adresiyle daha önce hesap oluşturulmuş.";
  if (code === "over_email_send_rate_limit") return "E-posta gönderim sınırına ulaşıldı. Biraz sonra yeniden dene.";
  if (code === "email_provider_disabled") return "E-posta ile giriş geçici olarak kullanılamıyor. Lütfen daha sonra tekrar dene.";
  if (code === "weak_password") return "Daha güçlü bir şifre seçmelisin.";
  // The SDK intentionally leaves code undefined for retryable 5xx/network
  // errors. Status is diagnostic context, not proof of invalid credentials.
  if (status === 429) return "Çok fazla deneme yaptın. Birkaç dakika sonra yeniden dene.";
  if (status === 0 || (status !== undefined && status >= 500 && status <= 599)) return "Giriş servisine ulaşılamadı. Bağlantını kontrol edip yeniden dene.";
  if (status === 403) return "Bu giriş isteğine izin verilmedi. Sayfayı yenileyip tekrar dene.";
  return mode === "signin"
    ? "Giriş şu anda tamamlanamadı. Lütfen tekrar dene."
    : "Kayıt şu anda oluşturulamadı. Lütfen tekrar dene.";
}
