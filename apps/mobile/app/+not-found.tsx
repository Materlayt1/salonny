import { router } from "expo-router";
import { EmptyState, AppButton, Screen } from "@/components/app-ui";

export default function NotFoundScreen() {
  return (
    <Screen>
      <EmptyState
        icon="?"
        title="Sayfa bulunamadı"
        detail="Aradığın ekran taşınmış veya artık mevcut değil."
        action={<AppButton label="Ana sayfaya dön" onPress={() => router.replace("/")} />}
      />
    </Screen>
  );
}
