import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { AppButton, BrandHeader, EmptyState, LoadingState, Screen } from "@/components/app-ui";
import { theme } from "@/constants/theme";
import { getSessionSummary } from "@/lib/api";
import { config } from "@/lib/config";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/auth-provider";

const menu = [
  { label: "Gizlilik politikası", detail: "Verilerinin nasıl işlendiğini incele", path: "/privacy" },
  { label: "KVKK", detail: "Aydınlatma metni ve hakların", path: "/kvkk" },
  { label: "Kullanım koşulları", detail: "Salonny kullanım şartları", path: "/terms" },
] as const;

export default function ProfileScreen() {
  const { session, user, loading, signOut } = useAuth();
  const summary = useQuery({
    queryKey: ["session-summary", user?.id],
    queryFn: () => getSessionSummary(session!.access_token),
    enabled: Boolean(session?.access_token),
  });

  if (loading) return <Screen><LoadingState label="Profilin hazırlanıyor..." /></Screen>;
  if (!session || !user) {
    return (
      <Screen>
        <BrandHeader />
        <EmptyState
          icon="○"
          title="Salonny hesabın"
          detail="Randevularını, favorilerini ve profilini tek yerden yönet."
          action={<AppButton label="Giriş yap veya kayıt ol" onPress={() => router.push("/auth")} />}
        />
      </Screen>
    );
  }

  const displayName = summary.data?.authenticated
    ? summary.data.displayName
    : String(user.user_metadata.full_name ?? user.email?.split("@")[0] ?? "Salonny kullanıcısı");
  const initials = displayName.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toLocaleUpperCase("tr-TR");

  const requestDeletion = () => {
    Alert.alert(
      "Hesap silme talebi",
      "Hesabının ve ilişkili kişisel verilerinin silinmesi için talep oluşturulacak. Bu işlem destek ekibi tarafından sonuçlandırılır.",
      [
        { text: "Vazgeç", style: "cancel" },
        {
          text: "Talep oluştur",
          style: "destructive",
          onPress: async () => {
            if (!supabase) return;
            const { error } = await supabase.from("account_deletion_requests").insert({
              user_id: user.id,
              reason: "Salonny mobil uygulamasından talep edildi.",
              status: "requested",
            });
            if (error?.code === "23505") Alert.alert("Talep mevcut", "Hesabın için zaten açık bir silme talebi bulunuyor.");
            else if (error) Alert.alert("Talep oluşturulamadı", "Lütfen daha sonra yeniden dene.");
            else Alert.alert("Talebin alındı", "İşlem sonucu e-posta adresine bildirilecek.");
          },
        },
      ],
    );
  };

  return (
    <Screen>
      <BrandHeader />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <View style={styles.avatar}><Text style={styles.avatarText}>{initials}</Text></View>
          <View style={styles.identity}>
            <Text numberOfLines={1} style={styles.name}>{displayName}</Text>
            <Text numberOfLines={1} style={styles.email}>{user.email}</Text>
            {summary.data?.authenticated && summary.data.city ? <Text style={styles.city}>{summary.data.city}</Text> : null}
          </View>
        </View>

        {summary.data?.authenticated && summary.data.hasBusiness ? (
          <Pressable onPress={() => void Linking.openURL(`${config.apiUrl}/business/dashboard`)} style={styles.businessBanner}>
            <View><Text style={styles.businessTitle}>İşletme paneli</Text><Text style={styles.businessDetail}>İşletmeni yönetmek için web panelini aç</Text></View>
            <Text style={styles.arrow}>›</Text>
          </Pressable>
        ) : null}

        <View style={styles.menuCard}>
          {menu.map((item) => (
            <Pressable key={item.path} onPress={() => void Linking.openURL(`${config.apiUrl}${item.path}`)} style={styles.menuRow}>
              <View style={styles.menuIcon}><Text style={styles.menuIconText}>i</Text></View>
              <View style={styles.menuText}>
                <Text style={styles.menuLabel}>{item.label}</Text>
                <Text style={styles.menuDetail}>{item.detail}</Text>
              </View>
              <Text style={styles.arrow}>›</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.actions}>
          <AppButton label="Oturumu kapat" variant="ghost" onPress={() => void signOut()} />
          <AppButton label="Hesap silme talebi oluştur" variant="danger" onPress={requestDeletion} />
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 16, padding: 20, paddingBottom: 34 },
  hero: { alignItems: "center", backgroundColor: theme.colors.primary, borderRadius: 26, flexDirection: "row", gap: 16, padding: 20 },
  avatar: { alignItems: "center", backgroundColor: "#fff", borderRadius: 38, height: 76, justifyContent: "center", width: 76 },
  avatarText: { color: theme.colors.primary, fontSize: 24, fontWeight: "900" },
  identity: { flex: 1 },
  name: { color: "#fff", fontSize: 21, fontWeight: "900" },
  email: { color: "#E8E1FF", fontSize: 13, marginTop: 4 },
  city: { color: "#fff", fontSize: 12, fontWeight: "700", marginTop: 6 },
  businessBanner: { alignItems: "center", backgroundColor: theme.colors.primarySoft, borderRadius: theme.radius.lg, flexDirection: "row", justifyContent: "space-between", padding: 18 },
  businessTitle: { color: theme.colors.primaryDark, fontSize: 16, fontWeight: "800" },
  businessDetail: { color: theme.colors.muted, fontSize: 12, marginTop: 4 },
  menuCard: { backgroundColor: "#fff", borderColor: theme.colors.border, borderRadius: theme.radius.lg, borderWidth: 1, overflow: "hidden" },
  menuRow: { alignItems: "center", borderBottomColor: theme.colors.border, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", gap: 12, padding: 16 },
  menuIcon: { alignItems: "center", backgroundColor: theme.colors.primarySoft, borderRadius: 12, height: 38, justifyContent: "center", width: 38 },
  menuIconText: { color: theme.colors.primary, fontSize: 16, fontWeight: "900" },
  menuText: { flex: 1 },
  menuLabel: { color: theme.colors.text, fontSize: 14, fontWeight: "800" },
  menuDetail: { color: theme.colors.muted, fontSize: 11, marginTop: 3 },
  arrow: { color: theme.colors.muted, fontSize: 28, fontWeight: "300" },
  actions: { gap: 10 },
});
