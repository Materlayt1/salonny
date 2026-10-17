import { router } from "expo-router";
import { useRef, useState } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { AppButton, LoadingState, Screen } from "@/components/app-ui";
import { theme } from "@/constants/theme";
import { BrandLogo } from "@/components/brand-logo";
import { useAuth } from "@/providers/auth-provider";
import { LegalReader } from "@/components/legal-reader";
import type { LegalDocumentKey } from "@/lib/api";
import { FormField } from "@/components/form-field";
import { signupPasswordMinimum, validateAuthEmail, validateAuthForm, type AuthFormErrors, type AuthFormField, type AuthFormMode } from "@/lib/auth-form";

export default function AuthScreen() {
  const { loading: authLoading, signIn, signUp, resetPassword, resendVerification } = useAuth();
  const [mode, setMode] = useState<AuthFormMode>("login");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<AuthFormErrors>({});
  const [legalDocument, setLegalDocument] = useState<LegalDocumentKey | null>(null);
  const fullNameRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const scrollRef = useRef<ScrollView>(null);

  const clearFieldError = (field: AuthFormField) => {
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
    setError("");
    setMessage("");
  };
  const validateField = (field: AuthFormField, event: Parameters<NonNullable<TextInputProps["onBlur"]>>[0]) => {
    if (Platform.OS === "web") {
      // A web pointer focuses the button before its click fires. Inserting an
      // inline error here can move that button out from under the pointer and
      // swallow the click. Form actions validate themselves after activation.
      const nextTarget = (event.nativeEvent as unknown as { relatedTarget?: { closest?: (selector: string) => unknown } }).relatedTarget;
      if (nextTarget?.closest?.("button, [role='button'], [role='tab'], [role='checkbox']")) return;
    }
    const next = validateAuthForm(mode, { fullName, email, password, accepted });
    setFieldErrors((current) => ({ ...current, [field]: next[field] }));
  };
  const focusError = (errors: AuthFormErrors) => {
    // Let inline errors commit and a web button's default focus finish first.
    requestAnimationFrame(() => {
      if (errors.fullName) fullNameRef.current?.focus();
      else if (errors.email) emailRef.current?.focus();
      else if (errors.password) passwordRef.current?.focus();
      else if (errors.consent) { Keyboard.dismiss(); scrollRef.current?.scrollToEnd({ animated: true }); }
    });
  };
  const changeMode = (next: AuthFormMode) => {
    setMode(next); setFieldErrors({}); setError(""); setMessage("");
  };

  const sendEmail = async (kind: "reset" | "verify") => {
    if (busy) return;
    setError(""); setMessage("");
    const emailError = validateAuthEmail(email);
    if (emailError) {
      setFieldErrors((current) => ({ ...current, email: emailError }));
      focusError({ email: emailError });
      return;
    }
    clearFieldError("email");
    Keyboard.dismiss();
    setBusy(true);
    try {
      if (kind === "reset") await resetPassword(email.trim());
      else await resendVerification(email.trim());
      setMessage(kind === "reset" ? "E-posta adresine gönderilen bağlantıdan şifreni yenileyebilirsin. Gelen kutunu ve spam klasörünü kontrol et." : "Doğrulama e-postası yeniden gönderildi. Gelen kutunu ve spam klasörünü kontrol et.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "İşlem tamamlanamadı."); }
    finally { setBusy(false); }
  };

  const submit = async () => {
    if (busy) return;
    setError("");
    setMessage("");
    const errors = validateAuthForm(mode, { fullName, email, password, accepted });
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      focusError(errors);
      return;
    }
    Keyboard.dismiss();
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
        <ScrollView ref={scrollRef} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
          <View style={{ marginTop: 18 }}><BrandLogo size={56} /></View>
          <Text style={styles.title}>{mode === "login" ? "Tekrar hoş geldin" : "Salonny’ye katıl"}</Text>
          <Text style={styles.subtitle}>{mode === "login" ? "Randevularına ve favorilerine devam et." : "En iyi işletmeleri keşfetmeye başla."}</Text>
          <View style={styles.modeRow}>
            <Pressable accessibilityRole="tab" aria-selected={mode === "login"} accessibilityState={{ selected: mode === "login", disabled: busy }} disabled={busy} onPress={() => changeMode("login")} style={[styles.modeButton, mode === "login" && styles.modeActive]}><Text style={[styles.modeText, mode === "login" && styles.modeTextActive]}>Giriş yap</Text></Pressable>
            <Pressable accessibilityRole="tab" aria-selected={mode === "signup"} accessibilityState={{ selected: mode === "signup", disabled: busy }} disabled={busy} onPress={() => changeMode("signup")} style={[styles.modeButton, mode === "signup" && styles.modeActive]}><Text style={[styles.modeText, mode === "signup" && styles.modeTextActive]}>Kayıt ol</Text></Pressable>
          </View>
          <View style={styles.form}>
            {mode === "signup" ? (
              <FormField ref={fullNameRef} label="Ad soyad" autoCapitalize="words" autoComplete="name" placeholder="Adın ve soyadın" editable={!busy} value={fullName} error={fieldErrors.fullName} onChangeText={(value) => { setFullName(value); clearFieldError("fullName"); }} onBlur={(event) => validateField("fullName", event)} returnKeyType="next" submitBehavior="submit" onSubmitEditing={() => emailRef.current?.focus()} />
            ) : null}
            <FormField ref={emailRef} label="E-posta" autoCapitalize="none" autoComplete="email" autoCorrect={false} keyboardType="email-address" placeholder="ad@ornek.com" editable={!busy} value={email} error={fieldErrors.email} onChangeText={(value) => { setEmail(value); clearFieldError("email"); }} onBlur={(event) => validateField("email", event)} returnKeyType="next" submitBehavior="submit" onSubmitEditing={() => passwordRef.current?.focus()} />
            <View style={styles.passwordRow}>
              <FormField ref={passwordRef} label="Şifre" autoCapitalize="none" autoCorrect={false} autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder={mode === "signup" ? "Yeni bir şifre oluştur" : "Şifreni gir"} editable={!busy} secureTextEntry={!showPassword} inputStyle={styles.passwordInput} value={password} error={fieldErrors.password} hint={mode === "signup" ? `En az ${signupPasswordMinimum} karakter kullan. Daha güçlü olması için harf, sayı ve simge ekleyebilirsin.` : undefined} onChangeText={(value) => { setPassword(value); clearFieldError("password"); }} onBlur={(event) => validateField("password", event)} returnKeyType="go" submitBehavior="submit" onSubmitEditing={() => void submit()} />
              <Pressable disabled={busy} accessibilityRole="button" accessibilityLabel={showPassword ? "Şifreyi gizle" : "Şifreyi göster"} onPress={() => setShowPassword((old) => !old)} style={styles.passwordToggle}><Text style={styles.linkText}>{showPassword ? "Gizle" : "Göster"}</Text></Pressable>
            </View>
            {mode === "login" ? <Pressable disabled={busy} accessibilityRole="button" onPress={() => void sendEmail("reset")}><Text style={styles.linkText}>Şifremi unuttum</Text></Pressable> : null}
            {mode === "signup" ? (
              <View style={{ gap: 7 }}>
                <View style={styles.legalLinks}><Pressable accessibilityRole="button" onPress={() => setLegalDocument("terms")}><Text style={styles.linkText}>Kullanım koşullarını oku</Text></Pressable><Pressable accessibilityRole="button" onPress={() => setLegalDocument("kvkk")}><Text style={styles.linkText}>KVKK metnini oku</Text></Pressable></View>
                <Pressable disabled={busy} accessibilityRole="checkbox" accessibilityState={{ checked: accepted, disabled: busy }} onPress={() => { setAccepted((value) => !value); clearFieldError("consent"); }} style={styles.checkRow}>
                  <View style={[styles.checkbox, accepted && styles.checkboxChecked]}><Text style={styles.checkmark}>{accepted ? "✓" : ""}</Text></View>
                  <Text style={styles.checkText}>Kullanım koşulları ve KVKK Aydınlatma Metni’ni kabul ediyorum.</Text>
                </Pressable>
                {fieldErrors.consent ? <Text accessibilityRole="alert" style={styles.fieldError}>{fieldErrors.consent}</Text> : null}
              </View>
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
  passwordRow: { position: "relative" }, passwordInput: { paddingRight: 82 }, passwordToggle: { position: "absolute", right: 4, top: 27, minWidth: 72, height: 52, justifyContent: "center", alignItems: "center", paddingHorizontal: 10 }, linkText: { color: theme.colors.primaryDark, fontSize: 13, lineHeight: 20, fontWeight: theme.typography.weight.medium, textAlign: "center", paddingVertical: 12 },
  legalLinks: { flexDirection: "row", flexWrap: "wrap", columnGap: 18 },
  checkRow: { alignItems: "flex-start", flexDirection: "row", gap: 10, minHeight: 44, paddingVertical: 8 },
  checkbox: { alignItems: "center", borderColor: theme.colors.border, borderRadius: 6, borderWidth: 1, height: 22, justifyContent: "center", width: 22 },
  checkboxChecked: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  checkmark: { color: "#fff", fontSize: 13, fontWeight: theme.typography.weight.semibold },
  checkText: { color: theme.colors.muted, flex: 1, fontSize: 13, lineHeight: 20 },
  fieldError: { color: theme.colors.danger, fontSize: 13, lineHeight: 19 },
  error: { backgroundColor: "#FEF3F2", borderRadius: 12, color: theme.colors.danger, fontSize: 12, padding: 12 },
  success: { backgroundColor: theme.colors.successSoft, borderRadius: 12, color: theme.colors.success, fontSize: 12, padding: 12 },
  security: { color: theme.colors.muted, fontSize: 11, lineHeight: 17, marginTop: 18, textAlign: "center" },
});
