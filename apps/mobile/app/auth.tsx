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
import { AppButton, Screen } from "@/components/app-ui";
import { theme } from "@/constants/theme";
import { useAuth } from "@/providers/auth-provider";

export default function AuthScreen() {
  const { configured, signIn, signUp } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const submit = async () => {
    setError("");
    setMessage("");
    if (!configured) {
      setError("Mobil kimlik servisi henüz yapılandırılmamış.");
      return;
    }
    if (!email.includes("@") || password.length < 8) {
      setError("Geçerli bir e-posta ve en az 8 karakterli şifre gir.");
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
        router.back();
      } else {
        await signUp(email.trim(), password, fullName.trim());
        setMessage("Hesabın oluşturuldu. E-postana gelen doğrulama bağlantısını aç.");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "İşlem tamamlanamadı.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
          <View style={styles.logo}><Text style={styles.logoText}>S</Text></View>
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
            <TextInput accessibilityLabel="E-posta" autoCapitalize="none" autoComplete="email" keyboardType="email-address" placeholder="E-posta" placeholderTextColor={theme.colors.muted} style={styles.input} value={email} onChangeText={setEmail} />
            <TextInput accessibilityLabel="Şifre" autoCapitalize="none" autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder="Şifre" placeholderTextColor={theme.colors.muted} secureTextEntry style={styles.input} value={password} onChangeText={setPassword} />
            {mode === "signup" ? (
              <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: accepted }} onPress={() => setAccepted((value) => !value)} style={styles.checkRow}>
                <View style={[styles.checkbox, accepted && styles.checkboxChecked]}><Text style={styles.checkmark}>{accepted ? "✓" : ""}</Text></View>
                <Text style={styles.checkText}>Kullanım koşulları ve KVKK Aydınlatma Metni’ni kabul ediyorum.</Text>
              </Pressable>
            ) : null}
            {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
            {message ? <Text style={styles.success}>{message}</Text> : null}
            <AppButton label={mode === "login" ? "Giriş yap" : "Hesap oluştur"} busy={busy} onPress={() => void submit()} />
          </View>
          <Text style={styles.security}>Oturum bilgilerin cihazın güvenli anahtar deposunda şifreli tutulur.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { alignItems: "center", padding: 24, paddingBottom: 48 },
  logo: { alignItems: "center", backgroundColor: theme.colors.primary, borderRadius: 30, height: 60, justifyContent: "center", marginTop: 18, width: 60 },
  logoText: { color: "#fff", fontSize: 30, fontWeight: "900" },
  title: { color: theme.colors.text, fontSize: 29, fontWeight: "900", letterSpacing: -0.8, marginTop: 20 },
  subtitle: { color: theme.colors.muted, fontSize: 14, marginTop: 7, textAlign: "center" },
  modeRow: { backgroundColor: theme.colors.primarySoft, borderRadius: 16, flexDirection: "row", marginTop: 24, padding: 4, width: "100%" },
  modeButton: { alignItems: "center", borderRadius: 13, flex: 1, padding: 11 },
  modeActive: { backgroundColor: "#fff", ...theme.shadow },
  modeText: { color: theme.colors.muted, fontSize: 13, fontWeight: "800" },
  modeTextActive: { color: theme.colors.primaryDark },
  form: { gap: 12, marginTop: 20, width: "100%" },
  input: { backgroundColor: "#fff", borderColor: theme.colors.border, borderRadius: theme.radius.md, borderWidth: 1, color: theme.colors.text, fontSize: 15, paddingHorizontal: 16, paddingVertical: 15 },
  checkRow: { alignItems: "flex-start", flexDirection: "row", gap: 10, paddingVertical: 4 },
  checkbox: { alignItems: "center", borderColor: theme.colors.border, borderRadius: 6, borderWidth: 1, height: 22, justifyContent: "center", width: 22 },
  checkboxChecked: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  checkmark: { color: "#fff", fontSize: 13, fontWeight: "900" },
  checkText: { color: theme.colors.muted, flex: 1, fontSize: 12, lineHeight: 18 },
  error: { backgroundColor: "#FEF3F2", borderRadius: 12, color: theme.colors.danger, fontSize: 12, padding: 12 },
  success: { backgroundColor: theme.colors.successSoft, borderRadius: 12, color: theme.colors.success, fontSize: 12, padding: 12 },
  security: { color: theme.colors.muted, fontSize: 11, lineHeight: 17, marginTop: 18, textAlign: "center" },
});
