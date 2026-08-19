import { BusinessInventoryManager, type ManagedProduct } from "@/components/business-inventory-manager";
import { requireBusinessContext } from "@/lib/business-context";

export default async function InventoryPage() {
  const { supabase, business } = await requireBusinessContext();
  const { data } = await supabase.from("inventory_products").select("id,name,sku,stock_quantity,minimum_stock,purchase_price_minor,sale_price_minor,active").eq("business_id", business.id).order("created_at", { ascending: false }).limit(1000);
  const products: ManagedProduct[] = (data ?? []).map((row) => ({ id: row.id, name: row.name, sku: row.sku, stockQuantity: Number(row.stock_quantity), minimumStock: Number(row.minimum_stock), purchasePrice: Number(row.purchase_price_minor ?? 0) / 100, salePrice: Number(row.sale_price_minor ?? 0) / 100, active: row.active }));
  return <BusinessInventoryManager initialProducts={products} />;
}
