import { notificationUuid } from "@salonny/contracts";

export type InventoryScope = { businessId: string; branchId: string };

/** Web and native write through the same membership-checked API. Never retry a stock write automatically. */
export async function writeInventoryRecord(
  scope: InventoryScope,
  values: Record<string, unknown>,
) {
  if (!notificationUuid(scope.businessId) || !notificationUuid(scope.branchId))
    return {
      ok: false,
      message: "İşletme kapsamı doğrulanamadı. Listeyi yenile.",
    };
  try {
    const response = await fetch(
      `/api/business-management/inventory?${new URLSearchParams(scope)}`,
      {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
        signal: AbortSignal.timeout(12_000),
      },
    );
    const result: unknown = await response.json();
    if (
      response.ok &&
      result &&
      typeof result === "object" &&
      "saved" in result &&
      result.saved === true
    )
      return { ok: true, message: "Değişiklik kaydedildi." };
    return {
      ok: false,
      message:
        result &&
        typeof result === "object" &&
        "error" in result &&
        typeof result.error === "string"
          ? result.error
          : "İşlem doğrulanamadı. Yeniden işlem yapmadan listeyi yenile.",
    };
  } catch {
    return {
      ok: false,
      message:
        "İşlem sonucu alınamadı. Tekrar işlem yapmadan önce listeyi yenileyip stok miktarını kontrol et.",
    };
  }
}
