import {
  BusinessInventoryManager,
  type ManagedProduct,
} from "@/components/business-inventory-manager";
import {
  BusinessDirectoryNavigation,
  BusinessDirectorySearch,
} from "@/components/business-directory-navigation";
import { requireBusinessPermission } from "@/lib/business-context";
import {
  BusinessAccessError,
  getBusinessRequestContext,
  requirePanelPermission,
} from "@/lib/business-request-context";
import {
  panelDirectoryFilter,
  panelDirectoryHref,
  panelDirectoryPageSize,
  parsePanelDirectoryQuery,
} from "@salonny/contracts";

type InventoryRow = {
  id: string;
  name: string;
  sku: string;
  stock_quantity: number;
  minimum_stock: number;
  purchase_price_minor?: number | null;
  sale_price_minor?: number | null;
  active: boolean;
};
type SearchValues = Record<string, string | string[] | undefined>;
const path = "/business/inventory";
const stockPrice = (minor: number | null | undefined) =>
  Number.isSafeInteger(minor)
    ? new Intl.NumberFormat("tr-TR", {
        style: "currency",
        currency: "TRY",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(minor! / 100)
    : "—";

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<SearchValues>;
}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams))
    for (const item of Array.isArray(value)
      ? value
      : value === undefined
        ? []
        : [value])
      search.append(key, item);
  let selected;
  try {
    selected = parsePanelDirectoryQuery(search);
  } catch {
    return (
      <p role="alert">
        Stok listesinin kapsamını, aramasını ve sayfasını kontrol et.{" "}
        <a href={path} className="underline">
          İlk sayfaya dön
        </a>
      </p>
    );
  }
  let context;
  try {
    context =
      selected.businessId || selected.branchId
        ? await getBusinessRequestContext(
            new Request(`http://local${path}?${search}`),
          )
        : await requireBusinessPermission("inventory");
    requirePanelPermission(context, "inventory");
  } catch (error) {
    if (error instanceof BusinessAccessError)
      return (
        <p role="alert">
          {error.status >= 500
            ? "İşletme bilgisi alınamadı. Listeyi yeniden yükle."
            : "Bu stok listesini görüntüleme yetkin yok."}
        </p>
      );
    throw error;
  }
  const { supabase, business, branch, role, financialVisibility } = context;
  const query = { ...selected, businessId: business.id, branchId: branch.id };
  const searchForm = (
    <BusinessDirectorySearch
      path={path}
      query={query}
      label="Ürün adı veya stok kodu ara"
    />
  );
  const failure = (
    <section>
      {searchForm}
      <p role="alert">
        Stok listesi alınamadı. Bu, boş bir liste değil.{" "}
        <a
          href={panelDirectoryHref(path, query, query.offset)}
          className="underline"
        >
          Yeniden dene
        </a>
      </p>
    </section>
  );
  const fields = [
    "id,name,sku,stock_quantity,minimum_stock,active",
    ...(financialVisibility ? ["purchase_price_minor,sale_price_minor"] : []),
  ].join(",");
  let result;
  try {
    let read = supabase
      .from("business_inventory_access")
      .select(fields, { count: "exact" })
      .eq("business_id", business.id);
    if (query.q) read = read.or(panelDirectoryFilter("inventory", query.q));
    result = await read
      .order("created_at", { ascending: false })
      .order("id")
      .range(query.offset, query.offset + panelDirectoryPageSize - 1)
      .abortSignal(AbortSignal.timeout(10_000))
      .overrideTypes<InventoryRow[], { merge: false }>();
  } catch {
    return failure;
  }
  const { data, error, count } = result;
  if (
    error ||
    !data ||
    count === null ||
    !Number.isSafeInteger(count) ||
    count < 0 ||
    data.some(
      (row) =>
        row.stock_quantity == null ||
        row.minimum_stock == null ||
        !Number.isFinite(Number(row.stock_quantity)) ||
        !Number.isFinite(Number(row.minimum_stock)),
    )
  )
    return failure;
  const navigation = (
    <BusinessDirectoryNavigation
      path={path}
      query={query}
      count={data.length}
      total={count}
    />
  );
  if (role === "EMPLOYEE")
    return (
      <section className="mx-auto max-w-6xl">
        <h1 className="text-2xl font-semibold">Stok listesi</h1>
        <p className="my-3 text-sm text-[#686872]">
          Stokları görüntüleyebilirsin. Ürün ve stok değişikliklerini işletme
          sahibi veya yönetici yapabilir.
        </p>
        {searchForm}
        {navigation}
        <div className="surface overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                {[
                  "Ürün",
                  "SKU",
                  "Miktar",
                  "Alt sınır",
                  ...(financialVisibility ? ["Alış", "Satış"] : []),
                ].map((heading) => (
                  <th key={heading} className="p-4 font-medium">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.id} className="border-t border-[#ECECF1]">
                  <td className="p-4">{row.name}</td>
                  <td className="p-4">{row.sku}</td>
                  <td className="p-4">{row.stock_quantity}</td>
                  <td className="p-4">{row.minimum_stock}</td>
                  {financialVisibility ? (
                    <>
                      <td className="p-4">
                        {stockPrice(row.purchase_price_minor)}
                      </td>
                      <td className="p-4">
                        {stockPrice(row.sale_price_minor)}
                      </td>
                    </>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
          {!data.length ? (
            <p className="p-6">
              {query.q
                ? "Aramayla eşleşen ürün yok."
                : query.offset
                  ? "Bu sayfada ürün yok."
                  : "Henüz ürün yok."}
            </p>
          ) : null}
        </div>
        {navigation}
      </section>
    );
  // An absent authorized amount is not a zero price or a zero stock value.
  if (
    data.some(
      (row) =>
        !Number.isSafeInteger(row.purchase_price_minor) ||
        !Number.isSafeInteger(row.sale_price_minor),
    )
  )
    return failure;
  const products: ManagedProduct[] = data.map((row) => ({
    id: row.id,
    name: row.name,
    sku: row.sku,
    stockQuantity: Number(row.stock_quantity),
    minimumStock: Number(row.minimum_stock),
    purchasePrice: row.purchase_price_minor! / 100,
    salePrice: row.sale_price_minor! / 100,
    active: row.active,
  }));
  return (
    <section>
      {searchForm}
      {navigation}
      <BusinessInventoryManager
        initialProducts={products}
        scope={{ businessId: business.id, branchId: branch.id }}
      />
      {navigation}
    </section>
  );
}
