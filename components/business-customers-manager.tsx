"use client";

import {
  Download,
  ImagePlus,
  Pencil,
  Plus,
  Search,
  UserRound,
  X,
} from "lucide-react";
import Image from "next/image";
import { useMemo, useState, useTransition } from "react";
import {
  registerCustomerCareMedia,
  saveCustomer,
  saveCustomerCareProfile,
} from "@/app/business/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate, formatMoney, initials } from "@/lib/format";
import { optimizeImageForUpload } from "@/lib/image-upload";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export type ManagedCustomer = {
  id: string;
  fullName: string;
  phone: string;
  email: string;
  notes: string;
  marketingConsent: boolean;
  totalVisits: number;
  totalSpendMinor: number;
  lastVisitAt: string | null;
  createdAt: string;
  allergies: string[];
  anamnesis: string;
  treatmentNotes: string;
  consentStatus: "missing" | "requested" | "signed" | "revoked";
  consentVersion: string;
  careMedia: {
    id: string;
    kind: "before" | "after" | "document";
    caption: string;
    storagePath: string;
    url: string;
  }[];
};
type Segment = "VIP" | "Sadık" | "Yeni" | "Riskli" | "Standart";
const emptyCustomer = {
  fullName: "",
  phone: "",
  email: "",
  notes: "",
  marketingConsent: false,
  allergies: [] as string[],
  anamnesis: "",
  treatmentNotes: "",
  consentStatus: "missing" as const,
  consentVersion: "",
  careMedia: [],
};

function segment(customer: ManagedCustomer): Segment {
  if (customer.totalSpendMinor >= 25_000_00 || customer.totalVisits >= 20)
    return "VIP";
  if (
    customer.lastVisitAt &&
    Date.now() - new Date(customer.lastVisitAt).getTime() > 90 * 86400000
  )
    return "Riskli";
  if (customer.totalVisits <= 1) return "Yeni";
  if (customer.totalVisits >= 5) return "Sadık";
  return "Standart";
}

export function BusinessCustomersManager({
  businessId,
  initialCustomers,
}: {
  businessId: string;
  initialCustomers: ManagedCustomer[];
}) {
  const [customers, setCustomers] = useState(initialCustomers);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [editing, setEditing] = useState<ManagedCustomer | "new" | null>(null);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const filtered = useMemo(
    () =>
      customers.filter((customer) => {
        const text =
          `${customer.fullName} ${customer.phone} ${customer.email}`.toLocaleLowerCase(
            "tr-TR",
          );
        return (
          text.includes(query.toLocaleLowerCase("tr-TR")) &&
          (filter === "all" || segment(customer) === filter)
        );
      }),
    [customers, query, filter],
  );
  const repeatRate = customers.length
    ? Math.round(
        (customers.filter((customer) => customer.totalVisits > 1).length /
          customers.length) *
          100,
      )
    : 0;
  const selected = editing === "new" ? emptyCustomer : editing;
  function submit(form: FormData) {
    const input = {
      id: editing && editing !== "new" ? editing.id : undefined,
      fullName: String(form.get("fullName") ?? ""),
      phone: String(form.get("phone") ?? ""),
      email: String(form.get("email") ?? ""),
      notes: String(form.get("notes") ?? ""),
      marketingConsent: form.get("marketingConsent") === "on",
    };
    const care = {
      allergies: String(form.get("allergies") ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      anamnesis: String(form.get("anamnesis") ?? ""),
      treatmentNotes: String(form.get("treatmentNotes") ?? ""),
      consentStatus: String(
        form.get("consentStatus") ?? "missing",
      ) as ManagedCustomer["consentStatus"],
      consentVersion: String(form.get("consentVersion") ?? ""),
    };
    startTransition(async () => {
      const result = await saveCustomer(input);
      setMessage(result.message);
      if (!result.ok) return;
      const customerId = input.id ?? result.id!;
      const careResult = await saveCustomerCareProfile({ customerId, ...care });
      if (!careResult.ok) {
        setMessage(careResult.message);
        return;
      }
      const previous = editing && editing !== "new" ? editing : null;
      const customer: ManagedCustomer = {
        ...input,
        ...care,
        id: customerId,
        totalVisits: previous?.totalVisits ?? 0,
        totalSpendMinor: previous?.totalSpendMinor ?? 0,
        lastVisitAt: previous?.lastVisitAt ?? null,
        createdAt: previous?.createdAt ?? new Date().toISOString(),
        careMedia: previous?.careMedia ?? [],
      };
      setCustomers((items) =>
        input.id
          ? items.map((item) => (item.id === input.id ? customer : item))
          : [customer, ...items],
      );
      setMessage("Müşteri ve bakım kartı kaydedildi.");
      setEditing(null);
    });
  }
  function downloadCsv() {
    const safe = (value: unknown) => {
      let text = String(value ?? "");
      if (/^[=+\-@]/.test(text)) text = `'${text}`;
      return `"${text.replaceAll('"', '""')}"`;
    };
    const rows = [
      ["Ad Soyad", "Telefon", "E-posta", "Ziyaret", "Harcama (TL)", "Segment"],
      ...filtered.map((customer) => [
        customer.fullName,
        customer.phone,
        customer.email,
        customer.totalVisits,
        customer.totalSpendMinor / 100,
        segment(customer),
      ]),
    ];
    const blob = new Blob(
      ["\uFEFF" + rows.map((row) => row.map(safe).join(",")).join("\n")],
      { type: "text/csv;charset=utf-8" },
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `musteriler-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function uploadCareImage(
    file: File,
    kind: "before" | "after" | "document",
  ) {
    if (!editing || editing === "new") return;
    if (!file.type.startsWith("image/") || file.size > 15 * 1024 * 1024) {
      setMessage("JPG, PNG veya WebP biçiminde en fazla 15 MB dosya seçin.");
      return;
    }
    const supabase = createBrowserSupabaseClient();
    if (!supabase) return setMessage("Dosya servisi şu anda kullanılamıyor.");
    setUploading(true);
    try {
      const optimized = await optimizeImageForUpload(file);
      const safeName = optimized.file.name
        .toLocaleLowerCase("tr-TR")
        .replace(/[^a-z0-9.]+/g, "-");
      const path = `${businessId}/${editing.id}/${crypto.randomUUID()}-${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from("customer-care-assets")
        .upload(path, optimized.file, {
          contentType: optimized.file.type,
          upsert: false,
        });
      if (uploadError) throw uploadError;
      const result = await registerCustomerCareMedia({
        customerId: editing.id,
        kind,
        storagePath: path,
      });
      if (!result.ok) {
        await supabase.storage.from("customer-care-assets").remove([path]);
        throw new Error(result.message);
      }
      const { data: signed } = await supabase.storage
        .from("customer-care-assets")
        .createSignedUrl(path, 3600);
      const media = {
        id: result.id!,
        kind,
        caption: "",
        storagePath: path,
        url: signed?.signedUrl ?? "",
      };
      setEditing((current) =>
        current && current !== "new"
          ? { ...current, careMedia: [...current.careMedia, media] }
          : current,
      );
      setCustomers((items) =>
        items.map((item) =>
          item.id === editing.id
            ? { ...item, careMedia: [...item.careMedia, media] }
            : item,
        ),
      );
      setMessage("Bakım görseli özel ve süreli erişimli alana yüklendi.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Görsel yüklenemedi.",
      );
    } finally {
      setUploading(false);
    }
  }
  return (
    <div className="mx-auto max-w-[1400px]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Müşteriler</h1>
          <p className="mt-1 text-sm text-[#686872]">
            Müşteri ilişkilerini ve ziyaret geçmişini yönet.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={downloadCsv}>
            <Download className="h-4 w-4" /> Dışa Aktar
          </Button>
          <Button onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" /> Müşteri Ekle
          </Button>
        </div>
      </div>
      {message && (
        <p className="mt-4 rounded-xl bg-[#F0ECFF] px-4 py-3 text-xs text-[#5938DF]">
          {message}
        </p>
      )}
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {[
          ["Toplam müşteri", customers.length],
          [
            "Bu ay yeni",
            customers.filter(
              (c) => new Date(c.createdAt).getTime() >= monthStart,
            ).length,
          ],
          ["Tekrar ziyaret", `%${repeatRate}`],
        ].map(([label, value]) => (
          <div key={String(label)} className="surface p-5">
            <span className="text-xs text-[#686872]">{label}</span>
            <strong className="mt-2 block text-2xl">{value}</strong>
          </div>
        ))}
      </div>
      <div className="surface mt-4 overflow-hidden">
        <div className="flex flex-wrap gap-3 border-b border-[#ECECF1] p-4">
          <label className="flex h-10 min-w-[240px] flex-1 items-center gap-2 rounded-xl border border-[#E8E8EE] px-3">
            <Search className="h-4 w-4" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Müşteri ara..."
              className="flex-1 text-xs outline-none"
            />
          </label>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="h-10 rounded-xl border border-[#E8E8EE] bg-white px-3 text-xs"
          >
            <option value="all">Tüm segmentler</option>
            {["VIP", "Sadık", "Yeni", "Riskli", "Standart"].map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-left text-xs">
            <thead className="bg-[#FAFAFC] text-[#8A8A94]">
              <tr>
                {[
                  "Müşteri",
                  "Telefon",
                  "Son ziyaret",
                  "Ziyaret",
                  "Toplam harcama",
                  "Segment",
                  "",
                ].map((head) => (
                  <th key={head} className="px-5 py-3 font-medium">
                    {head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#ECECF1]">
              {filtered.map((customer) => {
                const customerSegment = segment(customer);
                return (
                  <tr key={customer.id}>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <span className="grid h-9 w-9 place-items-center rounded-full bg-[#F0ECFF] font-semibold text-[#5B3BE7]">
                          {initials(customer.fullName)}
                        </span>
                        <div>
                          <strong>{customer.fullName}</strong>
                          {customer.email && (
                            <span className="block text-[10px] text-[#888894]">
                              {customer.email}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">{customer.phone}</td>
                    <td className="px-5 py-4">
                      {customer.lastVisitAt
                        ? formatDate(customer.lastVisitAt)
                        : "Henüz yok"}
                    </td>
                    <td className="px-5 py-4">{customer.totalVisits}</td>
                    <td className="px-5 py-4">
                      {formatMoney(customer.totalSpendMinor)}
                    </td>
                    <td className="px-5 py-4">
                      <Badge
                        tone={
                          customerSegment === "VIP"
                            ? "purple"
                            : customerSegment === "Riskli"
                              ? "red"
                              : customerSegment === "Yeni"
                                ? "green"
                                : "gray"
                        }
                      >
                        {customerSegment}
                      </Badge>
                    </td>
                    <td className="px-5 py-4">
                      <button
                        onClick={() => setEditing(customer)}
                        aria-label="Düzenle"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!filtered.length && (
          <div className="grid min-h-52 place-items-center p-8 text-center">
            <div>
              <UserRound className="mx-auto h-8 w-8 text-[#9B8FEA]" />
              <h2 className="mt-3 font-semibold">
                {customers.length ? "Eşleşen müşteri yok" : "Henüz müşteri yok"}
              </h2>
              <p className="mt-2 text-sm text-[#686872]">
                Randevu alan müşteriler otomatik olarak burada görünür.
              </p>
            </div>
          </div>
        )}
      </div>
      {selected && (
        <div
          className="fixed inset-0 z-[80] grid place-items-center bg-black/40 p-4"
          onMouseDown={(e) => e.target === e.currentTarget && setEditing(null)}
        >
          <form
            action={submit}
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-6"
          >
            <div className="flex justify-between">
              <h2 className="text-lg font-bold">
                {editing === "new" ? "Müşteri ekle" : "Müşteriyi düzenle"}
              </h2>
              <button type="button" onClick={() => setEditing(null)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-5 grid gap-4">
              <Input
                label="Ad soyad"
                name="fullName"
                defaultValue={selected.fullName}
                required
              />
              <Input
                label="Telefon"
                name="phone"
                defaultValue={selected.phone}
                required
              />
              <Input
                label="E-posta"
                name="email"
                type="email"
                defaultValue={selected.email}
              />
              <label className="grid gap-2 text-xs font-semibold">
                İşletme notu
                <textarea
                  name="notes"
                  rows={3}
                  defaultValue={selected.notes}
                  className="rounded-xl border border-[#E2E2E8] p-3 font-normal outline-none focus:border-[#6C4BF4]"
                />
              </label>
              <div className="rounded-2xl bg-[#F8F8FA] p-4">
                <h3 className="text-xs font-bold">Bakım, anamnez ve onam</h3>
                <div className="mt-3 grid gap-3">
                  <Input
                    label="Alerjiler (virgülle)"
                    name="allergies"
                    defaultValue={selected.allergies.join(", ")}
                  />
                  <label className="grid gap-2 text-xs font-semibold">
                    Anamnez
                    <textarea
                      name="anamnesis"
                      rows={2}
                      defaultValue={selected.anamnesis}
                      className="rounded-xl border border-[#E2E2E8] p-3 font-normal outline-none focus:border-[#6C4BF4]"
                    />
                  </label>
                  <label className="grid gap-2 text-xs font-semibold">
                    İşlem notları
                    <textarea
                      name="treatmentNotes"
                      rows={2}
                      defaultValue={selected.treatmentNotes}
                      className="rounded-xl border border-[#E2E2E8] p-3 font-normal outline-none focus:border-[#6C4BF4]"
                    />
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="grid gap-2 text-xs font-semibold">
                      Dijital onam
                      <select
                        name="consentStatus"
                        defaultValue={selected.consentStatus}
                        className="h-11 rounded-xl border border-[#E2E2E8] bg-white px-3 font-normal"
                      >
                        <option value="missing">Eksik</option>
                        <option value="requested">Talep edildi</option>
                        <option value="signed">İmzalandı</option>
                        <option value="revoked">Geri çekildi</option>
                      </select>
                    </label>
                    <Input
                      label="Onam sürümü"
                      name="consentVersion"
                      defaultValue={selected.consentVersion}
                      placeholder="v1.0"
                    />
                  </div>
                  {editing !== "new" && (
                    <div>
                      <span className="text-xs font-semibold">
                        Önce / sonra fotoğrafları
                      </span>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {selected.careMedia.map(
                          (media) =>
                            media.url && (
                              <div
                                key={media.id}
                                className="relative h-20 w-20 overflow-hidden rounded-xl border bg-white"
                              >
                                <Image
                                  src={media.url}
                                  alt={
                                    media.kind === "before"
                                      ? "İşlem öncesi"
                                      : media.kind === "after"
                                        ? "İşlem sonrası"
                                        : "Bakım belgesi"
                                  }
                                  fill
                                  className="object-cover"
                                  sizes="80px"
                                />
                                <span className="absolute bottom-1 left-1 rounded bg-black/65 px-1.5 py-0.5 text-[9px] text-white">
                                  {media.kind === "before"
                                    ? "Önce"
                                    : media.kind === "after"
                                      ? "Sonra"
                                      : "Belge"}
                                </span>
                              </div>
                            ),
                        )}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {(["before", "after", "document"] as const).map(
                          (kind) => (
                            <label
                              key={kind}
                              className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border bg-white px-3 py-2 text-xs font-semibold"
                            >
                              <ImagePlus className="h-3.5 w-3.5" />
                              {kind === "before"
                                ? "Önce"
                                : kind === "after"
                                  ? "Sonra"
                                  : "Belge"}
                              <input
                                type="file"
                                accept="image/jpeg,image/png,image/webp"
                                disabled={uploading}
                                className="sr-only"
                                onChange={(event) => {
                                  const file = event.target.files?.[0];
                                  if (file) void uploadCareImage(file, kind);
                                  event.currentTarget.value = "";
                                }}
                              />
                            </label>
                          ),
                        )}
                      </div>
                      <p className="mt-2 text-[10px] text-[#686872]">
                        Dosyalar özel depoda tutulur; bağlantılar 1 saat sonra
                        geçersizleşir.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <label className="mt-4 flex gap-2 text-sm">
              <input
                name="marketingConsent"
                type="checkbox"
                defaultChecked={selected.marketingConsent}
                className="accent-[#6C4BF4]"
              />{" "}
              Pazarlama izni müşteriden alındı
            </label>
            <Button disabled={pending} className="mt-6 w-full">
              {pending ? "Kaydediliyor..." : "Kaydet"}
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}
function Input(
  props: React.InputHTMLAttributes<HTMLInputElement> & { label: string },
) {
  const { label, ...inputProps } = props;
  return (
    <label className="grid gap-2 text-xs font-semibold">
      {label}
      <input
        {...inputProps}
        className="h-11 rounded-xl border border-[#E2E2E8] px-3 font-normal outline-none focus:border-[#6C4BF4]"
      />
    </label>
  );
}
