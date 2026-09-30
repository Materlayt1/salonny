import { Platform } from "react-native";

export const theme = {
  colors: {
    primary: "#6C4BF4",
    primaryDark: "#5435D6",
    primarySoft: "#EEEAFE",
    secondary: "#A78BFA",
    background: "#F7F7FA",
    surface: "#FFFFFF",
    text: "#15151A",
    muted: "#6F6F78",
    border: "#E7E7EC",
    success: "#15803D",
    successSoft: "#EAFBF0",
    warning: "#B45309",
    danger: "#B42318",
    overlay: "rgba(21,21,26,0.52)",
  },
  radius: {
    sm: 10,
    md: 16,
    lg: 22,
    pill: 999,
  },
  shadow: Platform.select({
    web: { boxShadow: "0 8px 18px rgba(36, 27, 70, 0.08)" },
    default: {
      shadowColor: "#241B46",
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.08,
      shadowRadius: 18,
      elevation: 3,
    },
  })!,
} as const;
