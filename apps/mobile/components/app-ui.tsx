import type { PropsWithChildren, ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { BrandLogo } from "@/components/brand-logo";
import { theme } from "@/constants/theme";

export function Screen({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  return <SafeAreaView edges={["top", "left", "right"]} style={[styles.screen, style]}>{children}</SafeAreaView>;
}

export function BrandHeader({ right }: { right?: ReactNode }) {
  return (
    <View style={styles.brandHeader}>
      <BrandLogo />
      {right}
    </View>
  );
}

export function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

type AppButtonProps = PressableProps & {
  label: string;
  busy?: boolean;
  variant?: "primary" | "secondary" | "ghost" | "danger";
};

export function AppButton({ label, busy, disabled, variant = "primary", style, ...props }: AppButtonProps) {
  return (
    <Pressable
      {...props}
      accessibilityRole="button"
      disabled={disabled || busy}
      style={(state) => [
        styles.button,
        styles[`${variant}Button`],
        (disabled || busy) && styles.buttonDisabled,
        state.pressed && styles.buttonPressed,
        typeof style === "function" ? style(state) : style,
      ]}
    >
      {busy ? <ActivityIndicator color={variant === "primary" ? "#fff" : theme.colors.primary} /> : (
        <Text style={[styles.buttonLabel, styles[`${variant}Label`]]}>{label}</Text>
      )}
    </Pressable>
  );
}

export function Chip({
  label,
  selected = false,
  onPress,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

export function LoadingState({ label = "Yükleniyor..." }: { label?: string }) {
  return (
    <View style={styles.centerState}>
      <ActivityIndicator size="large" color={theme.colors.primary} />
      <Text style={styles.stateText}>{label}</Text>
    </View>
  );
}

export function EmptyState({ icon = "✦", title, detail, action }: {
  icon?: string;
  title: string;
  detail: string;
  action?: ReactNode;
}) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyIcon}>{icon}</Text>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyDetail}>{detail}</Text>
      {action}
    </View>
  );
}

export function ErrorState({ onRetry }: { onRetry?: () => void }) {
  return (
    <EmptyState
      icon="!"
      title="Bir şeyler yolunda gitmedi"
      detail="Bağlantını kontrol edip yeniden deneyebilirsin."
      action={onRetry ? <AppButton label="Yeniden dene" variant="secondary" onPress={onRetry} /> : undefined}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  brandHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  brand: { color: theme.colors.primary, fontSize: 24, fontWeight: theme.typography.weight.semibold, letterSpacing: -0.8 },
  tagline: { color: theme.colors.muted, fontSize: 11, marginTop: 1 },
  sectionHeader: { gap: 3, paddingHorizontal: 20, paddingTop: 22, paddingBottom: 12 },
  sectionTitle: { color: theme.colors.text, fontSize: 20, lineHeight: 28, fontWeight: theme.typography.weight.semibold, letterSpacing: -0.3 },
  sectionSubtitle: { color: theme.colors.muted, fontSize: 13, lineHeight: 19 },
  button: {
    alignItems: "center",
    borderRadius: theme.radius.md,
    justifyContent: "center",
    minHeight: 50,
    paddingHorizontal: 18,
  },
  primaryButton: { backgroundColor: theme.colors.primary },
  secondaryButton: { backgroundColor: theme.colors.primarySoft },
  ghostButton: { backgroundColor: "transparent", borderColor: theme.colors.border, borderWidth: 1 },
  dangerButton: { backgroundColor: "#FEF3F2" },
  buttonDisabled: { opacity: 0.5 },
  buttonPressed: { transform: [{ scale: 0.98 }], opacity: 0.9 },
  buttonLabel: { fontSize: 15, fontWeight: theme.typography.weight.semibold },
  primaryLabel: { color: "#fff" },
  secondaryLabel: { color: theme.colors.primaryDark },
  ghostLabel: { color: theme.colors.text },
  dangerLabel: { color: theme.colors.danger },
  chip: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    paddingHorizontal: 15,
    paddingVertical: 10,
  },
  chipSelected: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  chipText: { color: theme.colors.text, fontSize: 13, fontWeight: theme.typography.weight.medium },
  chipTextSelected: { color: "#fff", fontWeight: theme.typography.weight.semibold },
  centerState: { alignItems: "center", gap: 12, justifyContent: "center", minHeight: 220 },
  stateText: { color: theme.colors.muted, fontSize: 14 },
  emptyState: {
    alignItems: "center",
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    gap: 9,
    margin: 20,
    padding: 28,
  },
  emptyIcon: {
    backgroundColor: theme.colors.primarySoft,
    borderRadius: 28,
    color: theme.colors.primary,
    fontSize: 24,
    fontWeight: theme.typography.weight.semibold,
    overflow: "hidden",
    paddingHorizontal: 17,
    paddingVertical: 12,
  },
  emptyTitle: { color: theme.colors.text, fontSize: 18, lineHeight: 26, fontWeight: theme.typography.weight.semibold, textAlign: "center" },
  emptyDetail: { color: theme.colors.muted, fontSize: 14, lineHeight: 21, textAlign: "center" },
});
