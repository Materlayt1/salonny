"use client";

import {
  AlertTriangle,
  ArrowDownUp,
  Package,
  Pencil,
  Plus,
  X,
} from "lucide-react";
import { useId, useLayoutEffect, useRef, useState, useTransition } from "react";
import {
  writeInventoryRecord,
  type InventoryScope,
} from "@/lib/inventory-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { inventoryFieldLimits } from "@salonny/contracts";

export type ManagedProduct = {
  id: string;
  name: string;
  sku: string;
  stockQuantity: number;
  minimumStock: number;
  purchasePrice: number;
  salePrice: number;
  active: boolean;
};
const emptyProduct: Omit<ManagedProduct, "id" | "stockQuantity"> = {
  name: "",
  sku: "",
  minimumStock: 0,
  purchasePrice: 0,
  salePrice: 0,
  active: true,
};

export function BusinessInventoryManager({
  initialProducts,
  scope,
}: {
  initialProducts: ManagedProduct[];
  scope: InventoryScope;
}) {
  const router = useRouter();
  const products = initialProducts;
  const [editing, setEditing] = useState<ManagedProduct | "new" | null>(null);
  const [adjusting, setAdjusting] = useState<ManagedProduct | null>(null);
  const [message, setMessage] = useState("");
  const [saveError, setSaveError] = useState(false);
  const [pending, startTransition] = useTransition();
  const selected = editing === "new" ? emptyProduct : editing;
  const stockValue = products.reduce(
    (sum, item) => sum + item.stockQuantity * item.purchasePrice,
    0,
  );
  const low = products.filter(
    (item) => item.active && item.stockQuantity <= item.minimumStock,
  ).length;
  function save(form: FormData) {
    const input = {
      id: editing && editing !== "new" ? editing.id : undefined,
      name: String(form.get("name") ?? ""),
      sku: String(form.get("sku") ?? ""),
      minimumStock: Number(form.get("minimumStock")),
      purchasePrice: Number(form.get("purchasePrice")),
      salePrice: Number(form.get("salePrice")),
      active: form.get("active") === "on",
    };
    startTransition(async () => {
      const result = await writeInventoryRecord(scope, input);
      setMessage(result.message);
      setSaveError(!result.ok);
      if (!result.ok) return;
      setEditing(null);
      router.refresh();
    });
  }
  function adjust(form: FormData) {
    if (!adjusting) return;
    const quantity = Number(form.get("quantity"));
    const reason = String(form.get("reason") ?? "");
    startTransition(async () => {
      const result = await writeInventoryRecord(scope, {
        id: adjusting.id,
        quantity,
        note: reason,
      });
      setMessage(result.message);
      setSaveError(!result.ok);
      if (!result.ok) return;
      setAdjusting(null);
      router.refresh();
    });
  }
  return (
    <div className="mx-auto max-w-[1200px]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Stok Yönetimi</h1>
          <p className="mt-1 text-sm text-[#686872]">
            Ürünlerini ve kaydedilmiş stok hareketlerini yönet.
          </p>
        </div>
        <Button
          disabled={pending}
          onClick={() => {
            setMessage("");
            setSaveError(false);
            setEditing("new");
          }}
        >
          <Plus className="h-4 w-4" /> Ürün Ekle
        </Button>
      </div>
      {message && (
        <p
          role={saveError ? "alert" : "status"}
          className={`mt-4 rounded-xl px-4 py-3 text-xs ${saveError ? "bg-[#FFF1F2] text-[#B42332]" : "bg-[#F0ECFF] text-[#5938DF]"}`}
        >
          {message}
        </p>
      )}
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {[
          ["Bu sayfadaki ürün", products.length, Package],
          ["Bu sayfadaki düşük stok", low, AlertTriangle],
          [
            "Bu sayfanın yaklaşık alış değeri",
            new Intl.NumberFormat("tr-TR", {
              style: "currency",
              currency: "TRY",
              maximumFractionDigits: 2,
            }).format(stockValue),
            ArrowDownUp,
          ],
        ].map(([label, value, Icon]) => {
          const ItemIcon = Icon as typeof Package;
          return (
            <div key={String(label)} className="surface p-5">
              <ItemIcon className="h-5 w-5 text-[#6C4BF4]" />
              <span className="mt-4 block text-xs text-[#686872]">
                {String(label)}
              </span>
              <strong className="mt-2 block text-2xl">{String(value)}</strong>
            </div>
          );
        })}
      </div>
      <div className="surface mt-4 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-left text-xs">
            <thead className="bg-[#FAFAFC] text-[#686872]">
              <tr>
                {[
                  "Ürün",
                  "SKU",
                  "Stok",
                  "Min. stok",
                  "Alış",
                  "Satış",
                  "Durum",
                  "İşlem",
                ].map((head) => (
                  <th key={head} className="px-5 py-3 font-medium">
                    {head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#ECECF1]">
              {products.map((product) => (
                <tr key={product.id}>
                  <td className="px-5 py-4 font-semibold">{product.name}</td>
                  <td className="px-5 py-4">{product.sku}</td>
                  <td className="px-5 py-4">{product.stockQuantity}</td>
                  <td className="px-5 py-4">{product.minimumStock}</td>
                  <td className="px-5 py-4">
                    {new Intl.NumberFormat("tr-TR", {
                      style: "currency",
                      currency: "TRY",
                      maximumFractionDigits: 2,
                    }).format(product.purchasePrice)}
                  </td>
                  <td className="px-5 py-4">
                    {new Intl.NumberFormat("tr-TR", {
                      style: "currency",
                      currency: "TRY",
                      maximumFractionDigits: 2,
                    }).format(product.salePrice)}
                  </td>
                  <td className="px-5 py-4">
                    <Badge
                      tone={
                        !product.active
                          ? "gray"
                          : product.stockQuantity <= product.minimumStock
                            ? "red"
                            : "green"
                      }
                    >
                      {!product.active
                        ? "Pasif"
                        : product.stockQuantity <= product.minimumStock
                          ? "Düşük stok"
                          : "Yeterli"}
                    </Badge>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex gap-2">
                      <button
                        disabled={pending}
                        onClick={() => {
                          setMessage("");
                          setSaveError(false);
                          setAdjusting(product);
                        }}
                        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border p-2 text-[#6C4BF4]"
                        title="Stok hareketi"
                      >
                        <ArrowDownUp className="h-4 w-4" />
                      </button>
                      <button
                        disabled={pending}
                        onClick={() => {
                          setMessage("");
                          setSaveError(false);
                          setEditing(product);
                        }}
                        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border p-2"
                        title="Düzenle"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!products.length && (
          <div className="grid min-h-52 place-items-center p-8 text-center">
            <div>
              <Package className="mx-auto h-8 w-8 text-[#9B8FEA]" />
              <h2 className="mt-3 font-semibold">Bu sayfada ürün yok</h2>
              <p className="mt-2 text-sm text-[#686872]">
                Aramanı veya sayfayı değiştirerek diğer ürünlere ulaşabilirsin.
              </p>
            </div>
          </div>
        )}
      </div>
      {selected && (
        <Modal
          title={editing === "new" ? "Yeni ürün" : "Ürünü düzenle"}
          busy={pending}
          close={() => setEditing(null)}
        >
          <form action={save}>
            <ModalHeader
              title={editing === "new" ? "Yeni ürün" : "Ürünü düzenle"}
              close={() => setEditing(null)}
              busy={pending}
            />
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Input
                label="Ürün adı"
                name="name"
                defaultValue={selected.name}
                minLength={2}
                maxLength={inventoryFieldLimits.name}
                required
              />
              <Input
                label="SKU"
                name="sku"
                defaultValue={selected.sku}
                maxLength={inventoryFieldLimits.sku}
                required
              />
              <Input
                label="Minimum stok"
                name="minimumStock"
                type="number"
                min={0}
                max={1000000}
                defaultValue={selected.minimumStock}
                required
              />
              <Input
                label="Alış fiyatı (TL)"
                name="purchasePrice"
                type="number"
                min={0}
                step=".01"
                max={10000000}
                defaultValue={selected.purchasePrice}
              />
              <Input
                label="Satış fiyatı (TL)"
                name="salePrice"
                type="number"
                min={0}
                step=".01"
                max={10000000}
                defaultValue={selected.salePrice}
              />
            </div>
            <label className="mt-4 flex gap-2 text-sm">
              <input
                name="active"
                type="checkbox"
                defaultChecked={selected.active}
                className="accent-[#6C4BF4]"
              />{" "}
              Aktif ürün
            </label>
            <Button disabled={pending} className="mt-6 w-full">
              Kaydet
            </Button>
            {saveError && message && (
              <p role="alert" className="mt-3 text-sm text-[#B42332]">
                {message}
              </p>
            )}
          </form>
        </Modal>
      )}
      {adjusting && (
        <Modal
          title={`${adjusting.name} · Stok hareketi`}
          busy={pending}
          close={() => setAdjusting(null)}
        >
          <form action={adjust}>
            <ModalHeader
              title={`${adjusting.name} · Stok hareketi`}
              close={() => setAdjusting(null)}
              busy={pending}
            />
            <p className="mt-2 text-xs text-[#686872]">
              Mevcut stok: {adjusting.stockQuantity}. Giriş için pozitif, çıkış
              için negatif miktar yaz.
            </p>
            <div className="mt-5 grid gap-4">
              <Input
                label="Miktar"
                name="quantity"
                type="number"
                step="1"
                min={-1000000}
                max={1000000}
                required
              />
              <Input
                label="Açıklama"
                name="reason"
                placeholder="Sayım, satın alma, kullanım..."
                maxLength={500}
              />
            </div>
            <Button disabled={pending} className="mt-6 w-full">
              Hareketi kaydet
            </Button>
            {saveError && message && (
              <p role="alert" className="mt-3 text-sm text-[#B42332]">
                {message}
              </p>
            )}
          </form>
        </Modal>
      )}
    </div>
  );
}
function Modal({
  close,
  children,
  title,
  busy,
}: {
  close: () => void;
  children: React.ReactNode;
  title: string;
  busy: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useLayoutEffect(() => {
    const element = dialog.current;
    const trigger =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    element?.showModal();
    return () => {
      element?.close();
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      className="m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-lg overflow-y-auto overscroll-contain rounded-3xl bg-white p-6 text-[#20202A] backdrop:bg-black/40"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) close();
      }}
      onClick={(event) => {
        if (!busy && event.target === event.currentTarget) {
          const box = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < box.left ||
            event.clientX > box.right ||
            event.clientY < box.top ||
            event.clientY > box.bottom
          )
            close();
        }
      }}
    >
      <span id={titleId} className="sr-only">
        {title}
      </span>
      {children}
    </dialog>
  );
}
function ModalHeader({
  title,
  close,
  busy,
}: {
  title: string;
  close: () => void;
  busy: boolean;
}) {
  return (
    <div className="flex justify-between">
      <h2 className="text-lg font-bold">{title}</h2>
      <button
        type="button"
        disabled={busy}
        onClick={close}
        aria-label="Formu kapat"
        className="grid h-11 w-11 place-items-center rounded-xl"
      >
        <X className="h-5 w-5" />
      </button>
    </div>
  );
}
function Input(
  props: React.InputHTMLAttributes<HTMLInputElement> & { label: string },
) {
  const { label, ...rest } = props;
  return (
    <label className="grid gap-2 text-xs font-semibold">
      {label}
      <input
        {...rest}
        className="h-11 rounded-xl border border-[#E2E2E8] px-3 font-normal outline-none focus:border-[#6C4BF4]"
      />
    </label>
  );
}
