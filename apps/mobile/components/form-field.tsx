import { forwardRef, useState } from "react";
import { StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type TextStyle } from "react-native";
import { theme } from "@/constants/theme";

export type FormFieldProps = TextInputProps & {
  label: string;
  error?: string;
  hint?: string;
  inputStyle?: StyleProp<TextStyle>;
};

/** Persistent labels and visible focus work on both native and web inputs. */
export const FormField = forwardRef<TextInput, FormFieldProps>(function FormField({
  label, error, hint, inputStyle, style, accessibilityLabel, accessibilityHint,
  onFocus, onBlur, placeholderTextColor, ...inputProps
}, ref) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        {...inputProps}
        ref={ref}
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityHint={error || accessibilityHint || hint}
        placeholderTextColor={placeholderTextColor ?? theme.colors.muted}
        selectionColor={theme.colors.primary}
        style={[styles.input, style, inputStyle, focused && styles.focused, !!error && styles.invalid]}
        onFocus={(event) => { setFocused(true); onFocus?.(event); }}
        onBlur={(event) => { setFocused(false); onBlur?.(event); }}
      />
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text>
        : hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  field: { gap: 7, width: "100%" },
  label: { color: theme.colors.text, fontSize: 14, lineHeight: 20, fontWeight: theme.typography.weight.medium },
  input: { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: theme.radius.md, borderWidth: 1, color: theme.colors.text, fontSize: 15, minHeight: 52, paddingHorizontal: 16, paddingVertical: 14 },
  focused: { borderColor: theme.colors.primary, backgroundColor: "#FCFBFF" },
  invalid: { borderColor: theme.colors.danger },
  hint: { color: theme.colors.muted, fontSize: 13, lineHeight: 19 },
  error: { color: theme.colors.danger, fontSize: 13, lineHeight: 19 },
});
