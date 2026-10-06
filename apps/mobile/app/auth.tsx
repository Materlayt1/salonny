import { router } from "expo-router";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { AppButton, LoadingState, Screen } from "@/components/app-ui";
import { theme } from "@/constants/theme";
import { BrandLogo } from "@/components/brand-logo";
import { useAuth } from "@/providers/auth-provider";
import { LegalReader } from "@/components/legal-reader";
import type { LegalDocumentKey } from "@/lib/api";

export default function AuthScreen() {
  const { loading: authLoading, signIn, signUp, resetPassword, resendVerification } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [legalDocument, setLegalDocument] = useState<LegalDocumentKey | null>(null);

  const sendEmail = async (kind: "reset" | "verify") => {
    setError(""); setMessage("");
    if (!email.trim().includes("@")) { setError("Önce e-posta adresini gir."); return; }
    setBusy(true);
    try {
      if (kind === "reset") await resetPassword(email.trim());
      else await resendVerification(email.trim());
      setMessage(kind === "reset" ? "E-posta adresine gönderilen bağlantıdan şifreni yenileyebilirsin. Gelen kutunu ve spam klasörünü kontrol et." : "Doğrulama e-postası yeniden gönderildi. Gelen kutunu ve spam klasörünü kontrol et.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "İşlem tamamlanamadı."); }
    finally { setBusy(false); }
  };

  const submit = async () => {
    setError("");
    setMessage("");
    if (!email.includes("@") || !password || (mode === "signup" && password.length < 8)) {
      setError(mode === "signup" ? "Geçerli bir e-posta ve en az 8 karakterli şifre gir." : "E-posta ve şifreni gir.");
      return;
    }
    if (mode === "signup" && (fullName.trim().length < 2 || !accepted)) {
      setError("Adını girip kullanım koşulları ile KVKK metnini onayla.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "login") {
        await signIn(email.trim(), password);
        if (router.canGoBack()) router.back();
        else router.replace("/");
      } else {
        const signedIn = await signUp(email.trim(), password, fullName.trim());
        if (signedIn) router.replace("/");
        else setMessage("Hesabın oluşturuldu. E-postana gelen doğrulama bağlantısını aç.");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "İşlem tamamlanamadı.");
    } finally {
      setBusy(false);
    }
  };

  if (authLoading) return <Screen><LoadingState label="Giriş ekranı hazırlanıyor..." /></Screen>;

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
          <View style={{ marginTop: 18 }}><BrandLogo size={56} /></View>
          <Text style={styles.title}>{mode === "login" ? "Tekrar hoş geldin" : "Salonny’ye katıl"}</Text>
          <Text style={styles.subtitle}>{mode === "login" ? "Randevularına ve favorilerine devam et." : "En iyi işletmeleri keşfetmeye başla."}</Text>
          <View style={styles.modeRow}>
            <Pressable onPress={() => setMode("login")} style={[styles.modeButton, mode === "login" && styles.modeActive]}><Text style={[styles.modeText, mode === "login" && styles.modeTextActive]}>Giriş yap</Text></Pressable>
            <Pressable onPress={() => setMode("signup")} style={[styles.modeButton, mode === "signup" && styles.modeActive]}><Text style={[styles.modeText, mode === "signup" && styles.modeTextActive]}>Kayıt ol</Text></Pressable>
          </View>
          <View style={styles.form}>
            {mode === "signup" ? (
              <TextInput accessibilityLabel="Ad soyad" autoCapitalize="words" placeholder="Ad soyad" placeholderTextColor={theme.colors.muted} style={styles.input} value={fullName} onChangeText={setFullName} />
            ) : null}
            {mode === "signup" ? <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 18 }}><Pressable accessibilityRole="button" onPress={() => setLegalDocument("terms")}><Text style={styles.linkText}>Kullanım koşullarını oku</Text></Pressable><Pressable accessibilityRole="button" onPress={() => setLegalDocument("kvkk")}><Text style={styles.linkText}>KVKK metnini oku</Text></Pressable></View> : null}
            <TextInput accessibilityLabel="E-posta" autoCapitalize="none" autoComplete="email" keyboardType="email-address" placeholder="E-posta" placeholderTextColor={theme.colors.muted} style={styles.input} value={email} onChangeText={setEmail} />
            <View style={styles.passwordRow}><TextInput accessibilityLabel="Şifre" autoCapitalize="none" autoCorrect={false} autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder="Şifre" placeholderTextColor={theme.colors.muted} secureTextEntry={!showPassword} style={[styles.input, styles.passwordInput]} value={password} onChangeText={setPassword} /><Pressable accessibilityRole="button" accessibilityLabel={showPassword ? "Şifreyi gizle" : "Şifreyi göster"} onPress={() => setShowPassword((old) => !old)} style={styles.passwordToggle}><Text style={styles.linkText}>{showPassword ? "Gizle" : "Göster"}</Text></Pressable></View>
            {mode === "login" ? <Pressable disabled={busy} accessibilityRole="button" onPress={() => void sendEmail("reset")}><Text style={styles.linkText}>Şifremi unuttum</Text></Pressable> : null}
            {mode === "signup" ? (
              <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: accepted }} onPress={() => setAccepted((value) => !value)} style={styles.checkRow}>
                <View style={[styles.checkbox, accepted && styles.checkboxChecked]}><Text style={styles.checkmark}>{accepted ? "✓" : ""}</Text></View>
                <Text style={styles.checkText}>Kullanım koşulları ve KVKK Aydınlatma Metni’ni kabul ediyorum.</Text>
              </Pressable>
            ) : null}
            {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
            {message ? <Text style={styles.success}>{message}</Text> : null}
            <AppButton label={mode === "login" ? "Giriş yap" : "Hesap oluştur"} busy={busy} onPress={() => void submit()} />
            <Pressable disabled={busy} accessibilityRole="button" onPress={() => void sendEmail("verify")}><Text style={styles.linkText}>Doğrulama e-postasını yeniden gönder</Text></Pressable>
          </View>
          <Text style={styles.security}>Hesabını ve randevularını tek yerden yönet.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
      <LegalReader document={legalDocument} onClose={() => setLegalDocument(null)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { alignItems: "center", alignSelf: "center", width: "100%", maxWidth: 440, padding: 24, paddingBottom: 48 },
  logo: { alignItems: "center", backgroundColor: theme.colors.primary, borderRadius: 30, height: 60, justifyContent: "center", marginTop: 18, width: 60 },
  logoText: { color: "#fff", fontSize: 30, fontWeight: theme.typography.weight.semibold },
  title: { color: theme.colors.text, fontSize: 28, lineHeight: 38, fontWeight: theme.typography.weight.semibold, letterSpacing: -0.4, marginTop: 20, textAlign: "center" },
  subtitle: { color: theme.colors.muted, fontSize: 14, lineHeight: 22, marginTop: 7, textAlign: "center" },
  modeRow: { backgroundColor: theme.colors.primarySoft, borderRadius: 16, flexDirection: "row", marginTop: 24, padding: 4, width: "100%" },
  modeButton: { alignItems: "center", borderRadius: 13, flex: 1, padding: 11 },
  modeActive: { backgroundColor: "#fff", ...theme.shadow },
  modeText: { color: theme.colors.muted, fontSize: 13, fontWeight: theme.typography.weight.medium },
  modeTextActive: { color: theme.colors.primaryDark, fontWeight: theme.typography.weight.semibold },
  form: { gap: 12, marginTop: 20, width: "100%" },
  input: { backgroundColor: "#fff", borderColor: theme.colors.border, borderRadius: theme.radius.md, borderWidth: 1, color: theme.colors.text, fontSize: 15, paddingHorizontal: 16, paddingVertical: 15 },
  passwordRow: { flexDirection: "row", alignItems: "center", gap: 10 }, passwordInput: { flex: 1, minWidth: 0 }, passwordToggle: { padding: 8 }, linkText: { color: theme.colors.primaryDark, fontSize: 12, fontWeight: theme.typography.weight.medium, textAlign: "center", paddingVertical: 6 },
  checkRow: { alignItems: "flex-start", flexDirection: "row", gap: 10, paddingVertical: 4 },
  checkbox: { alignItems: "center", borderColor: theme.colors.border, borderRadius: 6, borderWidth: 1, height: 22, justifyContent: "center", width: 22 },
  checkboxChecked: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  checkmark: { color: "#fff", fontSize: 13, fontWeight: theme.typography.weight.semibold },
  checkText: { color: theme.colors.muted, flex: 1, fontSize: 12, lineHeight: 18 },
  error: { backgroundColor: "#FEF3F2", borderRadius: 12, color: theme.colors.danger, fontSize: 12, padding: 12 },
  success: { backgroundColor: theme.colors.successSoft, borderRadius: 12, color: theme.colors.success, fontSize: 12, padding: 12 },
  security: { color: theme.colors.muted, fontSize: 11, lineHeight: 17, marginTop: 18, textAlign: "center" },
});
