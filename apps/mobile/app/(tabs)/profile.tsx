import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Alert } from "@/lib/alert";
import { AppButton, BrandHeader, EmptyState, LoadingState, Screen } from "@/components/app-ui";
import { theme } from "@/constants/theme";
import { getSessionSummary, requestAccountDeletion } from "@/lib/api";
import { config } from "@/lib/config";
import { useAuth } from "@/providers/auth-provider";
import { Heart, UserRound, Bell, ShieldCheck, FileText, ChevronRight, Store } from "lucide-react-native";

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
            try {
              await requestAccountDeletion(session.access_token);
              Alert.alert("Talebin alındı", "İşlem sonucu e-posta adresine bildirilecek.");
            } catch (error) {
              Alert.alert("Talep oluşturulamadı", error instanceof Error ? error.message : "Lütfen yeniden dene.");
            }
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
          <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/manage/[section]", params: { section: "dashboard" } })} style={styles.businessBanner}>
            <Store size={24} color={theme.colors.primary} /><View style={{ flex: 1 }}><Text style={styles.businessTitle}>İşletme paneli</Text><Text style={styles.businessDetail}>İşletmeni uygulamadan yönet</Text></View>
            <ChevronRight size={20} color={theme.colors.primary} />
          </Pressable>
        ) : null}

        <View style={styles.menuCard}>
          <Pressable accessibilityRole="button" onPress={() => router.push("/favorites")} style={styles.menuRow}><View style={styles.menuIcon}><Heart size={19} color={theme.colors.primary} /></View><View style={styles.menuText}><Text style={styles.menuLabel}>Favorilerim</Text><Text style={styles.menuDetail}>Kaydettiğin işletmeler</Text></View><ChevronRight size={18} color={theme.colors.muted} /></Pressable>
          <Pressable accessibilityRole="button" onPress={() => router.push("/profile-edit")} style={styles.menuRow}><View style={styles.menuIcon}><UserRound size={19} color={theme.colors.primary} /></View><View style={styles.menuText}><Text style={styles.menuLabel}>Kişisel bilgiler</Text><Text style={styles.menuDetail}>Ad soyad, telefon ve şehir bilgilerini düzenle</Text></View><ChevronRight size={18} color={theme.colors.muted} /></Pressable>
          <Pressable accessibilityRole="button" onPress={() => router.push("/notifications")} style={styles.menuRow}><View style={styles.menuIcon}><Bell size={19} color={theme.colors.primary} /></View><View style={styles.menuText}><Text style={styles.menuLabel}>Bildirimler</Text><Text style={styles.menuDetail}>{summary.data?.authenticated && summary.data.unreadCount ? `${summary.data.unreadCount} okunmamış bildirim` : "Randevu ve işletme güncellemeleri"}</Text></View><ChevronRight size={18} color={theme.colors.muted} /></Pressable>
          {menu.map((item) => (
            <Pressable key={item.path} onPress={() => void Linking.openURL(`${config.apiUrl}${item.path}`)} style={styles.menuRow}>
              <View style={styles.menuIcon}>{item.path === "/privacy" ? <ShieldCheck size={19} color={theme.colors.primary} /> : <FileText size={19} color={theme.colors.primary} />}</View>
              <View style={styles.menuText}>
                <Text style={styles.menuLabel}>{item.label}</Text>
                <Text style={styles.menuDetail}>{item.detail}</Text>
              </View>
              <ChevronRight size={18} color={theme.colors.muted} />
            </Pressable>
          ))}
        </View>
        <View style={styles.actions}>
          <AppButton label="Oturumu kapat" variant="ghost" onPress={() => void signOut().catch((error) => Alert.alert("İşlem tamamlanamadı", error.message))} />
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
  businessBanner: { alignItems: "center", backgroundColor: theme.colors.primarySoft, borderRadius: theme.radius.lg, flexDirection: "row", justifyContent: "space-between", padding: 18, gap: 12 },
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
