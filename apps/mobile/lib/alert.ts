import { Alert as NativeAlert, Platform, type AlertButton } from "react-native";

// React Native Web does not implement Alert; preview actions need visible feedback.
export const Alert = {
  alert(title: string, message = "", buttons?: AlertButton[]) {
    if (Platform.OS !== "web") return NativeAlert.alert(title, message, buttons);
    const action = buttons?.find((button) => button.style !== "cancel");
    if (buttons?.some((button) => button.style === "cancel")) {
      if (window.confirm(`${title}\n\n${message}`)) action?.onPress?.();
      return;
    }
    window.alert(`${title}\n\n${message}`);
    action?.onPress?.();
  },
};
