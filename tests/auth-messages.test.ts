import { describe, expect, it } from "vitest";
import { authErrorMessage } from "@/lib/auth/messages";

describe("safe authentication messages", () => {
  it.each([
    ["invalid_credentials", "E-posta veya şifre hatalı."],
    ["email_not_confirmed", "Devam etmek için önce e-posta adresini doğrulamalısın."],
    ["email_exists", "Bu e-posta adresiyle daha önce hesap oluşturulmuş."],
    ["user_already_exists", "Bu e-posta adresiyle daha önce hesap oluşturulmuş."],
    ["over_request_rate_limit", "Çok fazla deneme yaptın. Birkaç dakika sonra yeniden dene."],
    ["over_email_send_rate_limit", "E-posta gönderim sınırına ulaşıldı. Biraz sonra yeniden dene."],
    ["email_provider_disabled", "E-posta ile giriş geçici olarak kullanılamıyor. Lütfen daha sonra tekrar dene."],
    ["weak_password", "Daha güçlü bir şifre seçmelisin."],
  ])("preserves the known %s response instead of guessing from status", (code, expected) => {
    expect(authErrorMessage(code, "signin", 503)).toBe(expected);
    expect(authErrorMessage(code, "signup", 403)).toBe(expected);
  });

  it.each([0, 500, 501, 502, 503, 504, 520, 530, 599])("identifies unavailable service status %s without a code", (status) => {
    expect(authErrorMessage(undefined, "signin", status)).toBe("Giriş servisine ulaşılamadı. Bağlantını kontrol edip yeniden dene.");
  });

  it("provides a retry path for code-less rate and forbidden responses", () => {
    expect(authErrorMessage(undefined, "signin", 429)).toBe("Çok fazla deneme yaptın. Birkaç dakika sonra yeniden dene.");
    expect(authErrorMessage(undefined, "signin", 403)).toBe("Bu giriş isteğine izin verilmedi. Sayfayı yenileyip tekrar dene.");
  });

  it.each([undefined, 400, 401, 404, 422])("does not mislabel an unknown status %s as a bad password", (status) => {
    expect(authErrorMessage(undefined, "signin", status)).toBe("Giriş şu anda tamamlanamadı. Lütfen tekrar dene.");
    expect(authErrorMessage(undefined, "signup", status)).toBe("Kayıt şu anda oluşturulamadı. Lütfen tekrar dene.");
  });

  it("never returns unknown backend codes or untrusted details", () => {
    const untrustedCode = "fixture@example.com:password-secret:jwt-secret";
    const message = authErrorMessage(untrustedCode, "signin", 400);
    expect(message).toBe("Giriş şu anda tamamlanamadı. Lütfen tekrar dene.");
    expect(message).not.toContain(untrustedCode);
  });
});
