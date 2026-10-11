import { Slot, router, usePathname } from "expo-router";
import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Menu, X, ChevronDown, ChevronRight, Bell, LayoutDashboard, CalendarDays, CalendarCheck, Workflow, Users, Scissors, UserRound, ChartNoAxesCombined, Package, Megaphone, Settings, ArrowLeft, type LucideIcon } from "lucide-react-native";
import { AppButton, EmptyState, LoadingState, Screen } from "@/components/app-ui";
import { BrandLogo } from "@/components/brand-logo";
import { ManagementProvider, useManagement } from "@/providers/management-provider";
import { panelSections, canViewSection, type PanelSection } from "@/lib/management";
import { theme } from "@/constants/theme";

const icons: Record<PanelSection, LucideIcon> = { dashboard: LayoutDashboard, calendar: CalendarDays, appointments: CalendarCheck, operations: Workflow, customers: Users, services: Scissors, employees: UserRound, reports: ChartNoAxesCombined, inventory: Package, campaigns: Megaphone, settings: Settings };
function Shell() {
  const { context, setBranchId, setBusinessId, session } = useManagement();
  const [drawer, setDrawer] = useState(false);
  const pathname = usePathname();
  if (!session) return <Screen><EmptyState title="İşletme hesabına giriş yap" detail="Paneline erişmek için yetkili hesabınla giriş yap." action={<AppButton label="Giriş yap" onPress={() => router.replace("/auth")} />} /></Screen>;
  if (context.isPending) return <Screen><LoadingState label="İşletme panelin hazırlanıyor..." /></Screen>;
  if (!context.data) return <Screen><EmptyState title="Panel açılamadı" detail={context.error instanceof Error ? context.error.message : "İşletme bilgisi alınamadı."} action={<><AppButton label="Yeniden dene" onPress={() => void context.refetch()} /><AppButton label="Profilime dön" variant="ghost" onPress={() => router.replace("/profile")} /></>} /></Screen>;
  const data = context.data;
  return <Screen style={styles.screen}>
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="İşletme menüsünü aç" style={styles.iconButton} onPress={() => setDrawer(true)}><Menu size={22} color={theme.colors.text} /></Pressable>
      <View style={{ flex: 1 }}><Text numberOfLines={1} style={styles.business}>{data.business.name}</Text><Text style={styles.greeting}>Merhaba, {data.person.split(" ")[0]} 👋</Text></View>
      <Pressable accessibilityRole="button" accessibilityLabel="Bildirimler" style={styles.iconButton} onPress={() => router.push("/notifications")}><Bell size={20} color={theme.colors.text} /></Pressable>
    </View>
    <Slot />
    {context.isPlaceholderData ? <View style={[StyleSheet.absoluteFill, { backgroundColor: "#FFFFFFE8", zIndex: 10 }]} pointerEvents="auto"><LoadingState label="Seçili işletme ve şube yükleniyor..." /></View> : null}
    <Modal visible={drawer} transparent animationType="fade" onRequestClose={() => setDrawer(false)}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="Menüyü kapat" onPress={() => setDrawer(false)} />
        <Screen style={styles.drawer}>
          <View style={styles.logoRow}><BrandLogo size={36} /><Pressable accessibilityLabel="Menüyü kapat" onPress={() => setDrawer(false)}><X size={22} color={theme.colors.muted} /></Pressable></View>
          <ScrollView contentContainerStyle={styles.drawerBody}>
            <Text style={styles.caption}>İŞLETMEN</Text>
            {(data.businesses ?? [data.business]).map((business) => <Pressable key={business.id} style={[styles.branch, business.id === data.business.id && styles.selected]} onPress={() => { setBusinessId(business.id); setDrawer(false); }}><Text style={styles.label}>{business.name}</Text><ChevronDown size={16} color={theme.colors.primary} /></Pressable>)}
            <Text style={styles.caption}>ŞUBE SEÇİMİ</Text>
            {data.branches.map((branch) => <Pressable key={branch.id} style={[styles.branch, branch.id === data.branch.id && styles.selected]} onPress={() => { setBranchId(branch.id); setDrawer(false); }}><Text style={styles.label}>{branch.name}</Text><ChevronDown size={16} color={theme.colors.primary} /></Pressable>)}
            <View style={{ gap: 4, marginTop: 16 }}>{panelSections.filter((item) => canViewSection(data, item.key)).map((item) => {
              const Icon = icons[item.key]; const selected = pathname.endsWith(item.key) || (item.key === "dashboard" && pathname === "/manage");
              return <Pressable key={item.key} accessibilityRole="button" style={[styles.nav, selected && styles.selected]} onPress={() => { router.replace({ pathname: "/manage/[section]", params: { section: item.key } }); setDrawer(false); }}><Icon size={20} color={selected ? theme.colors.primary : theme.colors.muted} /><Text style={[styles.label, selected && { color: theme.colors.primary }]}>{item.label}</Text><ChevronRight size={16} color={theme.colors.muted} /></Pressable>;
            })}</View>
            <Pressable style={styles.nav} onPress={() => router.replace("/profile")}><ArrowLeft size={20} color={theme.colors.muted} /><Text style={styles.label}>Müşteri görünümüne dön</Text></Pressable>
          </ScrollView>
        </Screen>
      </View>
    </Modal>
  </Screen>;
}
export default function ManagementLayout() { return <ManagementProvider><Shell /></ManagementProvider>; }
const styles = StyleSheet.create({
  screen: { backgroundColor: "#F8F8FA" }, header: { backgroundColor: "#fff", borderBottomColor: theme.colors.border, borderBottomWidth: 1, paddingHorizontal: 16, height: 72, flexDirection: "row", alignItems: "center", gap: 12 },
  iconButton: { width: 40, height: 40, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 12, alignItems: "center", justifyContent: "center" }, business: { color: theme.colors.text, fontSize: 16, fontWeight: theme.typography.weight.semibold }, greeting: { color: theme.colors.muted, fontSize: 12, marginTop: 4 },
  overlay: { flex: 1, backgroundColor: "#0006" }, drawer: { width: "85%", maxWidth: 320, backgroundColor: "#fff" }, logoRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 20, borderBottomWidth: 1, borderBottomColor: theme.colors.border }, drawerBody: { padding: 16, paddingBottom: 40 }, caption: { color: theme.colors.muted, fontSize: 10, fontWeight: theme.typography.weight.semibold, letterSpacing: 1, marginTop: 16, marginBottom: 8 }, branch: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderColor: theme.colors.border, borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 6 }, selected: { backgroundColor: theme.colors.primarySoft }, nav: { flexDirection: "row", alignItems: "center", gap: 12, padding: 13, borderRadius: 12 }, label: { color: theme.colors.text, fontSize: 13, fontWeight: "600", flex: 1 },
});
