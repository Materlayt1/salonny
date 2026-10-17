import {
  BusinessInventoryManager,
  type ManagedProduct,
} from "@/components/business-inventory-manager";
import { requireBusinessPermission } from "@/lib/business-context";
import { formatMoney } from "@/lib/format";
type InventoryRow = { id: string; name: string; sku: string; stock_quantity: number; minimum_stock: number; purchase_price_minor?: number | null; sale_price_minor?: number | null; active: boolean };

export default async function InventoryPage() {
  const { supabase, business, role, financialVisibility } = await requireBusinessPermission("inventory");
  const fields = ["id,name,sku,stock_quantity,minimum_stock,active", ...(financialVisibility ? ["purchase_price_minor,sale_price_minor"] : [])].join(",");
  const { data, error, count } = await supabase
    .from("business_inventory_access")
    .select(
      fields,
      { count: "exact" },
    )
    .eq("business_id", business.id)
    .order("created_at", { ascending: false })
    .order("id")
    .limit(1000)
    .abortSignal(AbortSignal.timeout(10_000))
    .overrideTypes<InventoryRow[], { merge: false }>();
  if (error || count === null || !Number.isSafeInteger(count) || count < 0) return <p role="alert">Stok listesi alınamadı. Yeniden dene.</p>;
  if (role === "EMPLOYEE") return <section className="mx-auto max-w-6xl"><h1 className="text-2xl font-semibold">Stok listesi</h1><p className="mt-2 text-sm text-[#686872]">Stokları görüntüleyebilirsin. Ürün ve stok değişikliklerini işletme sahibi veya yönetici yapabilir.</p><p className="my-4 text-sm">{count} ürün · İlk {Math.min(count, 1000)} kayıt gösteriliyor.</p><div className="surface overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{["Ürün", "SKU", "Miktar", "Alt sınır", ...(financialVisibility ? ["Alış", "Satış"] : [])].map((heading) => <th key={heading} className="p-4 font-medium">{heading}</th>)}</tr></thead><tbody>{(data ?? []).map((row) => <tr key={row.id} className="border-t border-[#ECECF1]"><td className="p-4">{row.name}</td><td className="p-4">{row.sku}</td><td className="p-4">{row.stock_quantity}</td><td className="p-4">{row.minimum_stock}</td>{financialVisibility ? <><td className="p-4">{row.purchase_price_minor != null ? formatMoney(row.purchase_price_minor, "TRY") : "—"}</td><td className="p-4">{row.sale_price_minor != null ? formatMoney(row.sale_price_minor, "TRY") : "—"}</td></> : null}</tr>)}</tbody></table>{!data?.length ? <p className="p-6">Henüz ürün yok.</p> : null}</div></section>;
  const products: ManagedProduct[] = (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    sku: row.sku,
    stockQuantity: Number(row.stock_quantity),
    minimumStock: Number(row.minimum_stock),
    purchasePrice: Number(row.purchase_price_minor ?? 0) / 100,
    salePrice: Number(row.sale_price_minor ?? 0) / 100,
    active: row.active,
  }));
  return <><p className="mb-4 text-sm text-[#686872]">{count} ürün · İlk {Math.min(count, 1000)} kayıt gösteriliyor.</p><BusinessInventoryManager initialProducts={products} /></>;
}
