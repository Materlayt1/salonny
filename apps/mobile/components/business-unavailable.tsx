import { router } from "expo-router";
import { AppButton, EmptyState, Screen } from "@/components/app-ui";
export function BusinessUnavailable() {
  return <Screen><EmptyState icon="◇" title="İşletme şu anda yayında değil" detail="Bu işletme yayından kaldırılmış veya artık mevcut olmayabilir. Diğer işletmeleri keşfedebilirsin." action={<AppButton label="İşletmeleri keşfet" onPress={() => router.replace("/discover")} />} /></Screen>;
}
