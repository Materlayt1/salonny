import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { randomUUID } from "expo-crypto";
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Alert } from "@/lib/alert";
import { AppButton, Chip, EmptyState, ErrorState, LoadingState, Screen } from "@/components/app-ui";
import { FormField } from "@/components/form-field";
import { theme } from "@/constants/theme";
import { useBusiness } from "@/hooks/use-marketplace";
import { ApiError, createBooking, getAvailability, getCustomerProfile } from "@/lib/api";
import { dateKey, formatDate, formatTime, upcomingDates } from "@/lib/dates";
import { useAuth } from "@/providers/auth-provider";

const steps = ["Hizmet", "Uzman", "Tarih", "Onay"] as const;
const titles = ["Hizmetini seç", "Uzmanını seç", "Sana uygun saati seç", "Bilgilerini kontrol et"];
const descriptions = ["Süre ve fiyatları karşılaştır, sana uygun hizmetle devam et.", "Seçtiğin hizmeti veren uzmanlar aşağıda.", "İşletmenin yerel saatine göre önümüzdeki 14 gün.", "İletişim bilgilerin işletmeyle paylaşılır. Randevu özeti aşağıda."];

export default function BookingScreen() {
  const { slug = "", service: initialService } = useLocalSearchParams<{ slug: string; service?: string }>();
  const { user } = useAuth();
  // Changing business/account/service entry remounts all local draft state together.
  return <BookingContent key={`${slug}:${user?.id ?? "public"}:${initialService ?? ""}`} slug={slug} initialService={initialService} />;
}

function BookingContent({ slug, initialService }: { slug: string; initialService?: string }) {
  const { session, user, loading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const bookingDates = useMemo(() => upcomingDates(), []);
  const operation = useRef({ signature: "", key: "" });
  const submitting = useRef(false);
  const scroll = useRef<ScrollView>(null);
  const nameInput = useRef<TextInput>(null);
  const phoneInput = useRef<TextInput>(null);
  const business = useBusiness(slug);
  const [step, setStep] = useState(0);
  const [furthestStep, setFurthestStep] = useState(0);
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [date, setDate] = useState(dateKey(bookingDates[0]));
  const [slotSelection, setSlotSelection] = useState({ key: "", value: "" });
  const [name, setName] = useState<string | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const [touched, setTouched] = useState({ name: false, phone: false });
  const [bookingFailure, setBookingFailure] = useState("");
  const profile = useQuery({ queryKey: ["customer-profile", user?.id], queryFn: () => getCustomerProfile(session!.access_token), enabled: Boolean(session) });
  const serviceId = business.data?.services.find((service) => service.id === selectedServiceId)?.id || business.data?.services.find((service) => service.id === initialService)?.id || business.data?.services[0]?.id || "";

  const employees = useMemo(() => {
    if (!business.data) return [];
    return business.data.employees.filter((employee) => !employee.services.length || employee.services.includes(serviceId));
  }, [business.data, serviceId]);
  const employeeId = employees.some((employee) => employee.id === selectedEmployeeId) ? selectedEmployeeId : employees[0]?.id ?? "";
  const selectionKey = `${serviceId}:${employeeId}:${date}`;
  const defaultName = String(profile.data?.fullName || user?.user_metadata.full_name || user?.email?.split("@")[0] || "");
  // A deliberately cleared field must stay empty rather than silently falling back to the profile.
  const customerName = (name ?? defaultName).trim();
  const customerPhone = phone ?? profile.data?.phone ?? "";
  const nameError = customerName.length < 2 ? "Ad soyad en az 2 karakter olmalı." : customerName.length > 120 ? "Ad soyad en fazla 120 karakter olabilir." : "";
  const phoneDigits = customerPhone.replace(/\D/g, "");
  const phoneError = phoneDigits.length < 10 || phoneDigits.length > 15 || customerPhone.trim().length > 24 ? "Ülke koduyla veya başında 0 ile geçerli bir telefon yaz (en az 10 rakam)." : "";

  const availability = useQuery({
    queryKey: ["availability", business.data?.id, serviceId, employeeId, date],
    queryFn: () => getAvailability({ businessId: business.data!.id, branchId: business.data!.branchId!, serviceId, employeeId, date }),
    enabled: Boolean(session && business.data?.branchId && serviceId && employeeId && date && step >= 2),
    staleTime: 15_000,
  });
  // A refreshed response may remove a slot without a service/date change. Never submit that stale selection.
  const slot = slotSelection.key === selectionKey && availability.data?.slots.includes(slotSelection.value) ? slotSelection.value : "";
  const selectedService = business.data?.services.find((service) => service.id === serviceId);
  const selectedEmployee = employees.find((employee) => employee.id === employeeId);

  const moveTo = (next: number) => {
    Keyboard.dismiss();
    setStep(next);
    setFurthestStep((current) => Math.max(current, next));
  };
  useEffect(() => { scroll.current?.scrollTo({ y: 0, animated: false }); }, [step]);
  const changeService = (id: string) => {
    if (id !== serviceId) { setSlotSelection({ key: "", value: "" }); setBookingFailure(""); setFurthestStep(1); }
    setSelectedServiceId(id);
  };
  const changeEmployee = (id: string) => {
    if (id !== employeeId) { setSlotSelection({ key: "", value: "" }); setBookingFailure(""); setFurthestStep(2); }
    setSelectedEmployeeId(id);
  };
  const changeDate = (value: string) => {
    if (value !== date) { setSlotSelection({ key: "", value: "" }); setBookingFailure(""); setFurthestStep(2); }
    setDate(value);
  };

  const booking = useMutation({
    mutationFn: () => {
      // Keep this guard independent from the button state and server-side validation.
      if (!session || !user || !business.data?.branchId || !serviceId || !employeeId || !slot || nameError || phoneError) throw new Error("Randevu bilgilerini kontrol et ve uygun bir saat seç.");
      const input = {
        businessId: business.data.id, branchId: business.data.branchId, serviceId, employeeId, startsAt: slot,
        customer: { name: customerName, phone: customerPhone.trim(), email: user.email! }, paymentMethod: "business" as const,
      };
      const signature = JSON.stringify(input);
      if (operation.current.signature !== signature) operation.current = { signature, key: randomUUID() };
      return createBooking(input, session.access_token, operation.current.key);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["appointments"] });
      void queryClient.invalidateQueries({ queryKey: ["availability"] });
      Alert.alert("Randevun oluşturuldu", "İşletmenin onay durumunu Randevularım ekranından takip edebilirsin.", [
        { text: "Randevularıma git", onPress: () => router.replace("/appointments") },
      ]);
    },
    onError: (error) => {
      setBookingFailure(error instanceof Error ? error.message : "İşlem tamamlanamadı. Lütfen yeniden dene.");
      if (error instanceof ApiError && error.status === 409) {
        setSlotSelection({ key: "", value: "" });
        moveTo(2);
        void availability.refetch();
      }
    },
    onSettled: () => { submitting.current = false; },
  });

  const continueBooking = () => {
    if (submitting.current || booking.isPending) return;
    if (step < 3) { moveTo(step + 1); return; }
    setTouched({ name: true, phone: true });
    if (nameError || phoneError) {
      scroll.current?.scrollToEnd({ animated: true });
      if (nameError) nameInput.current?.focus(); else phoneInput.current?.focus();
      return;
    }
    Keyboard.dismiss();
    setBookingFailure("");
    submitting.current = true;
    booking.mutate();
  };

  if (authLoading || business.isLoading) return <Screen><LoadingState label="Randevu ekranı hazırlanıyor..." /></Screen>;
  if (!session || !user) return <Screen><EmptyState icon="◷" title="Randevu için giriş yap" detail="Bilgilerini güvenle kaydetmek ve randevunu yönetmek için hesabına giriş yap." action={<AppButton label="Giriş yap" onPress={() => router.push("/auth")} />} /></Screen>;
  if (business.isError || !business.data) return <Screen><ErrorState onRetry={() => void business.refetch()} /></Screen>;
  if (!business.data.branchId || !business.data.services.length || !business.data.employees.length) return <Screen><EmptyState icon="!" title="Randevu henüz açık değil" detail="Bu işletme hizmet veya çalışan planını tamamladığında randevu alabilirsin." /></Screen>;

  const canContinue = step === 0 ? Boolean(serviceId) : step === 1 ? Boolean(employeeId) : Boolean(slot) && !availability.isError;
  const currentDateIndex = bookingDates.findIndex((item) => dateKey(item) === date);
  const nextDate = bookingDates[currentDateIndex + 1];

  return (
    <Screen>
      <KeyboardAvoidingView style={styles.layout} behavior={Platform.OS === "ios" ? "padding" : Platform.OS === "android" ? "height" : undefined} keyboardVerticalOffset={Platform.OS === "ios" ? insets.top + 56 : 0}>
        <View style={styles.summary}>
          <Text style={styles.businessName}>{business.data.name}</Text>
          <Text style={styles.businessMeta}>{business.data.district}, {business.data.city}</Text>
        </View>
        <View style={styles.progress} accessibilityLabel={`Randevu adımı ${step + 1} / 4`}>
          {steps.map((label, index) => {
            const disabled = index > furthestStep || booking.isPending || (index === 3 && !slot);
            return <Pressable key={label} accessibilityRole="button" accessibilityLabel={`${index + 1}. ${label} adımı`} aria-current={step === index ? "step" : undefined} accessibilityState={{ selected: step === index, disabled }} disabled={disabled} onPress={() => moveTo(index)} style={({ pressed }) => [styles.progressStep, pressed && styles.pressed]}>
              <View style={[styles.progressNumber, index <= step && styles.progressNumberActive]}><Text style={[styles.progressNumberText, index <= step && styles.progressNumberTextActive]}>{index + 1}</Text></View>
              <Text style={[styles.progressLabel, step === index && styles.progressLabelActive]}>{label}</Text>
            </Pressable>;
          })}
        </View>
        <ScrollView ref={scroll} style={styles.scroll} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={styles.content}>
          <View style={styles.stepHeading}>
            <Text style={styles.stepTitle} accessibilityRole="header" accessibilityLiveRegion="polite">{titles[step]}</Text>
            <Text style={styles.stepDescription}>{descriptions[step]}</Text>
          </View>

          {step === 0 ? <View style={styles.card}>
            {business.data.services.map((service) => <Pressable key={service.id} accessibilityRole="radio" accessibilityLabel={`${service.name}, ${service.duration} dakika, ${service.price.toLocaleString("tr-TR")} lira`} aria-checked={serviceId === service.id} accessibilityState={{ checked: serviceId === service.id }} onPress={() => changeService(service.id)} style={({ pressed }) => [styles.choiceRow, pressed && styles.pressed]}>
              <View style={styles.rowText}><Text style={styles.rowTitle}>{service.name}</Text><Text style={styles.rowDetail}>{service.duration} dk · {service.price.toLocaleString("tr-TR")} ₺</Text>{service.description ? <Text style={styles.rowDetail}>{service.description}</Text> : null}</View>
              <View style={[styles.radio, serviceId === service.id && styles.radioSelected]}>{serviceId === service.id ? <View style={styles.radioDot} /> : null}</View>
            </Pressable>)}
          </View> : null}

          {step === 1 ? employees.length ? <View style={styles.card}>
            {employees.map((employee) => <Pressable key={employee.id} accessibilityRole="radio" accessibilityLabel={employee.name} aria-checked={employeeId === employee.id} accessibilityState={{ checked: employeeId === employee.id }} onPress={() => changeEmployee(employee.id)} style={({ pressed }) => [styles.choiceRow, pressed && styles.pressed]}>
              <View style={styles.avatar}><Text style={styles.avatarText}>{employee.name.trim().slice(0, 1).toLocaleUpperCase("tr-TR")}</Text></View>
              <View style={styles.rowText}><Text style={styles.rowTitle}>{employee.name}</Text><Text style={styles.rowDetail}>{employee.role || "Uzman"}</Text></View>
              <View style={[styles.radio, employeeId === employee.id && styles.radioSelected]}>{employeeId === employee.id ? <View style={styles.radioDot} /> : null}</View>
            </Pressable>)}
          </View> : <EmptyState title="Bu hizmet için uzman bulunamadı" detail="Başka bir hizmet seçerek yeniden deneyebilirsin." action={<AppButton label="Hizmeti değiştir" variant="secondary" onPress={() => moveTo(0)} />} /> : null}

          {step === 2 ? <>
            <ScrollView horizontal contentContainerStyle={styles.dates} showsHorizontalScrollIndicator={false} accessibilityLabel="Randevu tarihleri">
              {bookingDates.map((item) => <Chip key={dateKey(item)} label={formatDate(item)} selected={date === dateKey(item)} onPress={() => changeDate(dateKey(item))} />)}
            </ScrollView>
            {bookingFailure ? <Text style={styles.failure} accessibilityRole="alert">{bookingFailure} Farklı bir saat, gün veya uzman seçebilirsin.</Text> : null}
            <View style={styles.timeCard}>
              {availability.isLoading ? <LoadingState label="Uygun saatler aranıyor..." /> : availability.isError ? <ErrorState onRetry={() => void availability.refetch()} /> : !availability.data?.slots.length ? <View style={styles.noSlots}>
                <Text style={styles.noSlotTitle}>Bu gün dolu görünüyor</Text>
                <Text style={styles.noSlot}>Seçtiğin uzman ve hizmet için uygun saat yok. Başka bir gün veya uzman deneyebilirsin.</Text>
                {nextDate ? <AppButton label="Sonraki güne bak" variant="secondary" onPress={() => changeDate(dateKey(nextDate))} /> : null}
                <AppButton label={employees.length > 1 ? "Uzmanı değiştir" : "Hizmeti değiştir"} variant="ghost" onPress={() => moveTo(employees.length > 1 ? 1 : 0)} />
              </View> : <>
                <Text style={styles.slotLabel}>Uygun saatler · {formatDate(`${date}T12:00:00+03:00`)}</Text>
                <View style={styles.timeGrid}>{availability.data.slots.map((startsAt) => <View key={startsAt} style={styles.timeItem}><Chip label={formatTime(startsAt)} selected={slot === startsAt} onPress={() => { setSlotSelection({ key: selectionKey, value: startsAt }); setBookingFailure(""); }} /></View>)}</View>
              </>}
            </View>
          </> : null}

          {step === 3 ? <View style={styles.details}>
            <View style={styles.reviewCard}>
              <Text style={styles.reviewTitle}>Randevu detayları</Text>
              <Text style={styles.reviewText}>{selectedService?.name} · {selectedService?.duration} dk</Text>
              <Text style={styles.reviewText}>{selectedEmployee?.name}</Text>
              <Text style={styles.reviewText}>{slot ? `${formatDate(slot)} · ${formatTime(slot)}` : "Seçtiğin saat artık uygun değil."}</Text>
              <AppButton label="Tarih veya saati değiştir" variant="ghost" onPress={() => moveTo(2)} disabled={booking.isPending} />
            </View>
            <FormField ref={nameInput} label="Ad soyad" autoCapitalize="words" placeholder="Adın ve soyadın" value={name ?? defaultName} onChangeText={setName} onBlur={() => setTouched((current) => ({ ...current, name: true }))} error={touched.name ? nameError : undefined} maxLength={120} returnKeyType="next" onSubmitEditing={() => phoneInput.current?.focus()} editable={!booking.isPending} />
            <FormField ref={phoneInput} label="Telefon" keyboardType="phone-pad" textContentType="telephoneNumber" autoComplete="tel" placeholder="05xx xxx xx xx" value={customerPhone} onChangeText={setPhone} onBlur={() => setTouched((current) => ({ ...current, phone: true }))} error={touched.phone ? phoneError : undefined} maxLength={24} editable={!booking.isPending} />
            <View><Text style={styles.emailLabel}>E-posta</Text><Text style={styles.email}>{user.email}</Text></View>
            <Text style={styles.payment}>Ödeme işletmede yapılacaktır. Online ödeme şu an kullanılmıyor.</Text>
            {profile.isError ? <Text style={styles.stepDescription}>Kayıtlı iletişim bilgilerin yüklenemedi; bu alanları kendin doldurabilirsin.</Text> : null}
            {bookingFailure ? <Text style={styles.failure} accessibilityRole="alert">{bookingFailure}</Text> : null}
          </View> : null}
        </ScrollView>

        <View testID="booking-summary-footer" style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <View style={styles.confirmRow}>
            <View style={styles.rowText}><Text style={styles.confirmLabel} numberOfLines={1}>{selectedService?.name ?? "Hizmet seç"}</Text><Text style={styles.confirmDetail}>{slot ? `${formatDate(slot)} · ${formatTime(slot)}` : step < 2 ? "Tarih ve saat bir sonraki adımda" : "Devam etmek için saat seç"}</Text></View>
            <Text style={styles.confirmPrice}>{selectedService?.price.toLocaleString("tr-TR")} ₺</Text>
          </View>
          <View style={styles.footerActions}>
            {step > 0 ? <AppButton label="Geri" variant="ghost" onPress={() => moveTo(step - 1)} disabled={booking.isPending} style={styles.backButton} /> : null}
            <AppButton label={step === 3 ? "Randevuyu oluştur" : step === 0 ? "Uzman seçimine geç" : step === 1 ? "Tarih seçimine geç" : "Bilgileri kontrol et"} busy={booking.isPending} disabled={!canContinue || (step === 3 && !user.email)} onPress={continueBooking} style={styles.nextButton} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  layout: { flex: 1 }, scroll: { flex: 1 }, content: { paddingBottom: 24 },
  summary: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 12 },
  businessName: { color: theme.colors.text, fontSize: 18, lineHeight: 25, fontWeight: theme.typography.weight.semibold },
  businessMeta: { color: theme.colors.muted, fontSize: 13, lineHeight: 19, marginTop: 3 },
  progress: { flexDirection: "row", paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border, paddingBottom: 10 },
  progressStep: { alignItems: "center", flex: 1, gap: 5, minHeight: 64, paddingVertical: 4, borderRadius: 10 },
  progressNumber: { alignItems: "center", justifyContent: "center", height: 28, width: 28, borderRadius: 14, backgroundColor: "#F3F3F6" },
  progressNumberActive: { backgroundColor: theme.colors.primarySoft },
  progressNumberText: { color: theme.colors.muted, fontSize: 13, fontWeight: theme.typography.weight.medium },
  progressNumberTextActive: { color: theme.colors.primaryDark },
  progressLabel: { color: theme.colors.muted, fontSize: 13, lineHeight: 19 },
  progressLabelActive: { color: theme.colors.primaryDark, fontWeight: theme.typography.weight.medium },
  stepHeading: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16, gap: 6 },
  stepTitle: { color: theme.colors.text, fontSize: 21, lineHeight: 29, fontWeight: theme.typography.weight.semibold },
  stepDescription: { color: theme.colors.muted, fontSize: 14, lineHeight: 21 },
  card: { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: theme.radius.lg, borderWidth: 1, marginHorizontal: 20, paddingHorizontal: 16 },
  choiceRow: { alignItems: "center", borderBottomColor: theme.colors.border, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", gap: 12, minHeight: 74, paddingVertical: 15 },
  rowText: { flex: 1, minWidth: 0 }, rowTitle: { color: theme.colors.text, fontSize: 16, lineHeight: 23, fontWeight: theme.typography.weight.medium },
  rowDetail: { color: theme.colors.muted, fontSize: 14, lineHeight: 21, marginTop: 3 },
  radio: { height: 22, width: 22, borderRadius: 11, borderColor: "#9595A1", borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  radioSelected: { borderColor: theme.colors.primary }, radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: theme.colors.primary },
  avatar: { alignItems: "center", justifyContent: "center", width: 44, height: 44, borderRadius: 22, backgroundColor: theme.colors.primarySoft },
  avatarText: { color: theme.colors.primaryDark, fontSize: 18, fontWeight: theme.typography.weight.medium },
  pressed: { opacity: 0.75 }, dates: { gap: 8, paddingHorizontal: 20, paddingBottom: 2 },
  timeCard: { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: theme.radius.lg, borderWidth: 1, marginHorizontal: 20, marginTop: 16, minHeight: 90, padding: 16 },
  slotLabel: { color: theme.colors.muted, fontSize: 14, lineHeight: 21, marginBottom: 14 }, timeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  timeItem: { minWidth: "28%", flexGrow: 1 }, noSlots: { gap: 12 },
  noSlotTitle: { color: theme.colors.text, fontSize: 17, lineHeight: 24, fontWeight: theme.typography.weight.medium }, noSlot: { color: theme.colors.muted, fontSize: 14, lineHeight: 21 },
  details: { gap: 18, paddingHorizontal: 20 }, reviewCard: { gap: 7, padding: 16, backgroundColor: "#F8F7FC", borderRadius: theme.radius.md },
  reviewTitle: { color: theme.colors.text, fontSize: 15, lineHeight: 22, fontWeight: theme.typography.weight.medium, marginBottom: 2 }, reviewText: { color: theme.colors.muted, fontSize: 14, lineHeight: 21 },
  emailLabel: { color: theme.colors.text, fontSize: 14, lineHeight: 21, marginBottom: 6 }, email: { color: theme.colors.muted, fontSize: 14, lineHeight: 21 },
  payment: { color: theme.colors.muted, fontSize: 13, lineHeight: 20 },
  failure: { color: theme.colors.danger, backgroundColor: "#FEF3F2", fontSize: 14, lineHeight: 21, borderRadius: theme.radius.sm, padding: 12, marginHorizontal: 20, marginTop: 12 },
  footer: { borderTopWidth: 1, borderTopColor: theme.colors.border, backgroundColor: theme.colors.surface, paddingHorizontal: 20, paddingTop: 14, gap: 12 },
  confirmRow: { alignItems: "center", flexDirection: "row", gap: 12 }, confirmLabel: { color: theme.colors.text, fontSize: 15, lineHeight: 22, fontWeight: theme.typography.weight.medium },
  confirmDetail: { color: theme.colors.muted, fontSize: 13, lineHeight: 20, marginTop: 3 }, confirmPrice: { color: theme.colors.primaryDark, fontSize: 19, lineHeight: 27, fontWeight: theme.typography.weight.semibold },
  footerActions: { flexDirection: "row", gap: 10 }, backButton: { paddingHorizontal: 16 }, nextButton: { flex: 1 },
});
