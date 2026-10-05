import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { AppButton, EmptyState, ErrorState, LoadingState, Screen } from "@/components/app-ui";
import { theme } from "@/constants/theme";
import { getCustomerProfile, saveCustomerProfile, type CustomerProfile } from "@/lib/api";
import { Alert } from "@/lib/alert";
import { useAuth } from "@/providers/auth-provider";

export default function ProfileEditScreen() {
  const { session, loading } = useAuth();
  const client = useQueryClient();
  const [draft, setDraft] = useState<Partial<Omit<CustomerProfile, "email">>>({});
  const profile = useQuery({ queryKey: ["customer-profile", session?.user.id], queryFn: () => getCustomerProfile(session!.access_token), enabled: Boolean(session) });
  const values = { fullName: draft.fullName ?? profile.data?.fullName ?? "", phone: draft.phone ?? profile.data?.phone ?? "", city: draft.city ?? profile.data?.city ?? "" };
  const save = useMutation({
    mutationFn: () => saveCustomerProfile(values, session!.access_token),
    onSuccess: async () => { await Promise.all([client.invalidateQueries({ queryKey: ["customer-profile"] }), client.invalidateQueries({ queryKey: ["session-summary"] })]); setDraft({}); Alert.alert("Kaydedildi", "Profil bilgilerin güncellendi."); },
    onError: (error) => Alert.alert("Kaydedilemedi", error.message),
  });
  if (loading || profile.isLoading) return <Screen><LoadingState label="Bilgilerin yükleniyor..." /></Screen>;
  if (!session) return <Screen><EmptyState title="Hesabına giriş yap" detail="Profilini düzenlemek için giriş yapmalısın." action={<AppButton label="Giriş yap" onPress={() => router.push("/auth")} />} /></Screen>;
  if (profile.isError) return <Screen><ErrorState onRetry={() => void profile.refetch()} /></Screen>;
  return <Screen><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Text style={styles.title}>Kişisel bilgiler</Text><Text style={styles.subtitle}>İletişim bilgilerin randevu oluştururken kullanılır.</Text>
    <View style={styles.form}>
      <Text style={styles.label}>Ad soyad</Text><TextInput accessibilityLabel="Ad soyad" autoCapitalize="words" maxLength={120} value={values.fullName} onChangeText={(value) => setDraft((old) => ({ ...old, fullName: value }))} style={styles.input} />
      <Text style={styles.label}>Telefon</Text><TextInput accessibilityLabel="Telefon" keyboardType="phone-pad" maxLength={24} value={values.phone} onChangeText={(value) => setDraft((old) => ({ ...old, phone: value }))} style={styles.input} />
      <Text style={styles.label}>Şehir</Text><TextInput accessibilityLabel="Şehir" autoCapitalize="words" maxLength={80} value={values.city} onChangeText={(value) => setDraft((old) => ({ ...old, city: value }))} style={styles.input} />
      <Text style={styles.label}>E-posta</Text><Text style={styles.email}>{profile.data?.email}</Text>
      <AppButton label="Bilgileri kaydet" busy={save.isPending} disabled={values.fullName.trim().length < 2} onPress={() => save.mutate()} />
    </View>
  </ScrollView></Screen>;
}

const styles = StyleSheet.create({
  content: { padding: 24, paddingBottom: 40 }, title: { color: theme.colors.text, fontSize: 28, fontWeight: "900" }, subtitle: { color: theme.colors.muted, fontSize: 14, lineHeight: 21, marginTop: 8 },
  form: { gap: 12, marginTop: 24 }, label: { color: theme.colors.text, fontSize: 13, fontWeight: "700" },
  input: { backgroundColor: "#fff", borderColor: theme.colors.border, borderWidth: 1, borderRadius: 14, padding: 15, color: theme.colors.text }, email: { color: theme.colors.muted, padding: 12, marginBottom: 12 },
});
