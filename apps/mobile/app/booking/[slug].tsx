import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { AppButton, Chip, EmptyState, ErrorState, LoadingState, Screen, SectionHeader } from "@/components/app-ui";
import { theme } from "@/constants/theme";
import { useBusiness } from "@/hooks/use-marketplace";
import { createBooking, getAvailability } from "@/lib/api";
import { useAuth } from "@/providers/auth-provider";

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

const bookingDates = Array.from({ length: 14 }, (_, index) => {
  const value = new Date();
  value.setDate(value.getDate() + index + 1);
  return value;
});

export default function BookingScreen() {
  const { slug = "" } = useLocalSearchParams<{ slug: string }>();
  const { session, user, loading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const business = useBusiness(slug);
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [date, setDate] = useState(dateKey(bookingDates[0]));
  const [slotSelection, setSlotSelection] = useState({ key: "", value: "" });
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const serviceId = selectedServiceId || business.data?.services[0]?.id || "";

  const employees = useMemo(() => {
    if (!business.data) return [];
    return business.data.employees.filter((employee) => !employee.services.length || employee.services.includes(serviceId));
  }, [business.data, serviceId]);

  const employeeId = employees.some((employee) => employee.id === selectedEmployeeId)
    ? selectedEmployeeId
    : employees[0]?.id ?? "";
  const selectionKey = `${serviceId}:${employeeId}:${date}`;
  const slot = slotSelection.key === selectionKey ? slotSelection.value : "";
  const defaultName = String(user?.user_metadata.full_name ?? user?.email?.split("@")[0] ?? "");
  const customerName = name.trim() || defaultName;

  const availability = useQuery({
    queryKey: ["availability", business.data?.id, serviceId, employeeId, date],
    queryFn: () => getAvailability({
      businessId: business.data!.id,
      branchId: business.data!.branchId!,
      serviceId,
      employeeId,
      date,
    }),
    enabled: Boolean(business.data?.branchId && serviceId && employeeId && date),
    staleTime: 15_000,
  });

  const booking = useMutation({
    mutationFn: () => createBooking({
      businessId: business.data!.id,
      branchId: business.data!.branchId!,
      serviceId,
      employeeId,
      startsAt: slot,
      customer: { name: customerName, phone: phone.trim(), email: user!.email! },
      paymentMethod: "business",
    }, session!.access_token),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["appointments"] });
      Alert.alert("Randevun oluşturuldu", "İşletmenin onay durumunu Randevularım ekranından takip edebilirsin.", [
        { text: "Randevularıma git", onPress: () => router.replace("/appointments") },
      ]);
    },
    onError: (error) => Alert.alert("Randevu oluşturulamadı", error instanceof Error ? error.message : "Lütfen yeniden dene."),
  });

  if (authLoading || business.isLoading) return <Screen><LoadingState label="Randevu ekranı hazırlanıyor..." /></Screen>;
  if (!session || !user) {
    return (
      <Screen>
        <EmptyState icon="◷" title="Randevu için giriş yap" detail="Bilgilerini güvenle kaydetmek ve randevunu yönetmek için hesabına giriş yap." action={<AppButton label="Giriş yap" onPress={() => router.push("/auth")} />} />
      </Screen>
    );
  }
  if (business.isError || !business.data) return <Screen><ErrorState onRetry={() => void business.refetch()} /></Screen>;
  if (!business.data.branchId || !business.data.services.length || !business.data.employees.length) {
    return <Screen><EmptyState icon="!" title="Randevu henüz açık değil" detail="Bu işletme hizmet veya çalışan planını tamamladığında randevu alabilirsin." /></Screen>;
  }

  const selectedService = business.data.services.find((service) => service.id === serviceId);
  const canSubmit = Boolean(slot && customerName.length >= 2 && phone.replace(/\D/g, "").length >= 10);

  return (
    <Screen>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <View style={styles.summary}>
          <Text style={styles.businessName}>{business.data.name}</Text>
          <Text style={styles.businessMeta}>{business.data.district}, {business.data.city}</Text>
        </View>

        <SectionHeader title="1. Hizmet seç" />
        <View style={styles.card}>
          {business.data.services.map((service) => (
            <View key={service.id} style={styles.row}>
              <View style={styles.rowText}><Text style={styles.rowTitle}>{service.name}</Text><Text style={styles.rowDetail}>{service.duration} dk · {service.price.toLocaleString("tr-TR")} ₺</Text></View>
              <Chip label={serviceId === service.id ? "Seçildi" : "Seç"} selected={serviceId === service.id} onPress={() => setSelectedServiceId(service.id)} />
            </View>
          ))}
        </View>

        <SectionHeader title="2. Uzman seç" />
        <ScrollView horizontal contentContainerStyle={styles.chips} showsHorizontalScrollIndicator={false}>
          {employees.map((employee) => <Chip key={employee.id} label={employee.name} selected={employeeId === employee.id} onPress={() => setSelectedEmployeeId(employee.id)} />)}
        </ScrollView>

        <SectionHeader title="3. Tarih ve saat" subtitle="Önümüzdeki 14 gündeki uygun saatler" />
        <ScrollView horizontal contentContainerStyle={styles.chips} showsHorizontalScrollIndicator={false}>
          {bookingDates.map((item) => <Chip key={dateKey(item)} label={item.toLocaleDateString("tr-TR", { weekday: "short", day: "2-digit", month: "short" })} selected={date === dateKey(item)} onPress={() => setDate(dateKey(item))} />)}
        </ScrollView>
        <View style={styles.timeCard}>
          {availability.isLoading ? <LoadingState label="Uygun saatler aranıyor..." /> : null}
          {availability.isError ? <ErrorState onRetry={() => void availability.refetch()} /> : null}
          {!availability.isLoading && !availability.isError && !availability.data?.slots.length ? <Text style={styles.noSlot}>Bu tarihte uygun saat bulunamadı.</Text> : null}
          <View style={styles.timeGrid}>
            {(availability.data?.slots ?? []).map((startsAt) => (
              <View key={startsAt} style={styles.timeItem}><Chip label={new Date(startsAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })} selected={slot === startsAt} onPress={() => setSlotSelection({ key: selectionKey, value: startsAt })} /></View>
            ))}
          </View>
        </View>

        <SectionHeader title="4. İletişim bilgileri" />
        <View style={styles.form}>
          <TextInput accessibilityLabel="Ad soyad" autoCapitalize="words" placeholder="Ad soyad" placeholderTextColor={theme.colors.muted} style={styles.input} value={name || defaultName} onChangeText={setName} />
          <TextInput accessibilityLabel="Telefon" keyboardType="phone-pad" placeholder="Telefon" placeholderTextColor={theme.colors.muted} style={styles.input} value={phone} onChangeText={setPhone} />
          <Text style={styles.email}>{user.email}</Text>
        </View>

        <View style={styles.confirmCard}>
          <View><Text style={styles.confirmLabel}>{selectedService?.name ?? "Hizmet"}</Text><Text style={styles.confirmDetail}>{slot ? new Date(slot).toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: "short" }) : "Tarih ve saat seç"}</Text></View>
          <Text style={styles.confirmPrice}>{selectedService?.price.toLocaleString("tr-TR")} ₺</Text>
        </View>
        <Text style={styles.payment}>Ödeme işletmede yapılacaktır. Online ödeme şu an kullanılmıyor.</Text>
        <AppButton label="Randevuyu oluştur" busy={booking.isPending} disabled={!canSubmit} onPress={() => booking.mutate()} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 38 },
  summary: { backgroundColor: theme.colors.primary, padding: 20 },
  businessName: { color: "#fff", fontSize: 23, fontWeight: "900" },
  businessMeta: { color: "#E8E1FF", fontSize: 13, marginTop: 4 },
  card: { backgroundColor: "#fff", borderColor: theme.colors.border, borderRadius: theme.radius.lg, borderWidth: 1, marginHorizontal: 20, paddingHorizontal: 16 },
  row: { alignItems: "center", borderBottomColor: theme.colors.border, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", gap: 12, paddingVertical: 13 },
  rowText: { flex: 1 },
  rowTitle: { color: theme.colors.text, fontSize: 14, fontWeight: "800" },
  rowDetail: { color: theme.colors.muted, fontSize: 11, marginTop: 4 },
  chips: { gap: 8, paddingHorizontal: 20 },
  timeCard: { backgroundColor: "#fff", borderColor: theme.colors.border, borderRadius: theme.radius.lg, borderWidth: 1, marginHorizontal: 20, marginTop: 12, minHeight: 90, padding: 14 },
  timeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  timeItem: { minWidth: "30%" },
  noSlot: { color: theme.colors.muted, fontSize: 13, padding: 16, textAlign: "center" },
  form: { gap: 10, paddingHorizontal: 20 },
  input: { backgroundColor: "#fff", borderColor: theme.colors.border, borderRadius: theme.radius.md, borderWidth: 1, color: theme.colors.text, paddingHorizontal: 16, paddingVertical: 15 },
  email: { color: theme.colors.muted, fontSize: 12, paddingHorizontal: 4 },
  confirmCard: { alignItems: "center", backgroundColor: theme.colors.primarySoft, borderRadius: theme.radius.lg, flexDirection: "row", justifyContent: "space-between", marginHorizontal: 20, marginTop: 22, padding: 18 },
  confirmLabel: { color: theme.colors.primaryDark, fontSize: 15, fontWeight: "900" },
  confirmDetail: { color: theme.colors.muted, fontSize: 11, marginTop: 4 },
  confirmPrice: { color: theme.colors.primaryDark, fontSize: 18, fontWeight: "900" },
  payment: { color: theme.colors.muted, fontSize: 11, lineHeight: 17, marginHorizontal: 24, marginVertical: 12, textAlign: "center" },
});
