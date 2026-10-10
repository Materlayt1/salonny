"use client";

import {
  CalendarPlus,
  ClipboardList,
  Copy,
  Link2,
  LoaderCircle,
  PackagePlus,
  Plus,
  Upload,
  UsersRound,
  Wrench,
} from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  assignServicePackage,
  createBookingLink,
  createServicePackage,
  createStaffAppointmentSeries,
  createWaitlistEntry,
  importCustomers,
  saveBusinessResource,
  saveMemberPermissions,
  setWaitlistStatus,
} from "@/app/business/actions";
import { Button } from "@/components/ui/button";
import { parseCustomerCsv } from "@/lib/csv";
import { formatDate } from "@/lib/format";

type Named = { id: string; name: string };
export type OperationsData = {
  scopeKey: string;
  businessSlug: string;
  customers: (Named & { phone: string })[];
  services: Named[];
  employees: Named[];
  waitlist: {
    id: string;
    status: string;
    desired_from: string;
    desired_to: string;
    party_size: number;
    notes: string | null;
    offer_expires_at: string | null;
    offered_starts_at: string | null;
    updated_at: string;
    customers:
      | { full_name: string; phone: string }
      | { full_name: string; phone: string }[]
      | null;
    services: { name: string } | { name: string }[] | null;
  }[];
  resources: {
    id: string;
    name: string;
    kind: "room" | "chair" | "device" | "other";
    capacity: number;
    active: boolean;
    service_resources: { service_id: string }[] | null;
  }[];
  links: {
    id: string;
    token: string;
    label: string;
    source: string;
    campaign: string | null;
    visits: number;
    conversions: number;
    active: boolean;
    services: { name: string } | { name: string }[] | null;
  }[];
  packages: {
    id: string;
    name: string;
    session_count: number;
    validity_days: number;
    active: boolean;
    services: { name: string } | { name: string }[] | null;
  }[];
  deliverySummary: { total: number; queued: number; deadLetter: number };
  members: {
    user_id: string;
    role: "OWNER" | "MANAGER" | "EMPLOYEE";
    users:
      | { full_name: string | null; email: string }
      | { full_name: string | null; email: string }[]
      | null;
    business_member_permissions:
      | {
          permissions: Record<string, boolean>;
          customer_visibility: "all" | "assigned" | "none";
          financial_visibility: boolean;
        }
      | {
          permissions: Record<string, boolean>;
          customer_visibility: "all" | "assigned" | "none";
          financial_visibility: boolean;
        }[]
      | null;
  }[];
};

const one = <T,>(value: T | T[] | null) =>
  Array.isArray(value) ? value[0] : value;
function toIso(value: FormDataEntryValue | null) {
  const date = new Date(String(value ?? ""));
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

export function BusinessOperationsManager({
  initial,
}: {
  initial: OperationsData;
}) {
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const [section, setSection] = useState("appointments");
  const run = (job: () => Promise<{ ok: boolean; message: string }>) =>
    startTransition(async () => {
      try {
        const result = await job();
        setMessage(result.message);
        if (result.ok) window.location.reload();
      } catch {
        setMessage("İşlem yanıtı doğrulanamadı. Bilgileri değiştirmeden tekrar deneyin; listeyi yenileyerek sonucu da kontrol edebilirsiniz.");
      }
    });
  const tabs = [
    ["appointments", "Hızlı randevu"],
    ["waitlist", "Bekleme listesi"],
    ["resources", "Kaynaklar"],
    ["growth", "Büyüme"],
    ["permissions", "Yetkiler"],
    ["import", "Veri taşıma"],
  ];
  return (
    <div className="mx-auto max-w-[1400px]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Operasyon Merkezi</h1>
          <p className="mt-1 text-sm text-[#686872]">
            Bekleme listesi, walk-in, tekrar randevu, kaynak, paket ve büyüme
            araçları.
          </p>
        </div>
        <div className="flex gap-2 text-xs">
          <span className="rounded-xl bg-white px-3 py-2">
            İletişim kuyruğu: <b>{initial.deliverySummary.queued}</b>
          </span>
          <span className="rounded-xl bg-white px-3 py-2">
            Dead-letter: <b>{initial.deliverySummary.deadLetter}</b>
          </span>
        </div>
      </div>
      {message && (
        <p
          role="status"
          className="mt-4 rounded-xl bg-[#F0ECFF] px-4 py-3 text-xs text-[#5938DF]"
        >
          {message}
        </p>
      )}
      <div className="mt-6 flex gap-2 overflow-x-auto pb-2">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setSection(key)}
            className={`whitespace-nowrap rounded-xl px-4 py-2.5 text-xs font-semibold ${section === key ? "bg-[#6C4BF4] text-white" : "border border-[#E3E3E9] bg-white"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {section === "appointments" && (
        <QuickAppointment initial={initial} pending={pending} run={run} />
      )}
      {section === "waitlist" && (
        <Waitlist initial={initial} pending={pending} run={run} />
      )}
      {section === "resources" && (
        <Resources initial={initial} pending={pending} run={run} />
      )}
      {section === "growth" && (
        <Growth initial={initial} pending={pending} run={run} />
      )}
      {section === "permissions" && (
        <Permissions initial={initial} pending={pending} run={run} />
      )}
      {section === "import" && <ImportPanel pending={pending} run={run} />}
    </div>
  );
}

type Runner = (job: () => Promise<{ ok: boolean; message: string }>) => void;
function QuickAppointment({
  initial,
  pending,
  run,
}: {
  initial: OperationsData;
  pending: boolean;
  run: Runner;
}) {
  return (
    <section className="surface mt-4 p-5">
      <div className="flex items-center gap-3">
        <CalendarPlus className="h-5 w-5 text-[#6C4BF4]" />
        <div>
          <h2 className="font-semibold">
            Walk-in, grup ve tekrar eden randevu
          </h2>
          <p className="text-xs text-[#686872]">
            Çakışma kontrolü tüm seri için veritabanında atomik çalışır.
          </p>
        </div>
      </div>
      <form
        className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4"
        action={(form) =>
          run(() =>
            createStaffAppointmentSeries({
              customerId: String(form.get("customer")),
              employeeId: String(form.get("employee")),
              serviceId: String(form.get("service")),
              startsAt: toIso(form.get("startsAt")),
              partySize: Number(form.get("partySize")),
              repeatCount: Number(form.get("repeatCount")),
              intervalDays: Number(form.get("intervalDays")),
              source: String(form.get("source")) as "walk_in" | "staff",
            }),
          )
        }
      >
        <Select label="Müşteri" name="customer" items={initial.customers} />
        <Select label="Hizmet" name="service" items={initial.services} />
        <Select label="Çalışan" name="employee" items={initial.employees} />
        <Field
          label="Başlangıç"
          name="startsAt"
          type="datetime-local"
          required
        />
        <Field
          label="Kişi sayısı"
          name="partySize"
          type="number"
          min={1}
          max={50}
          defaultValue={1}
        />
        <Field
          label="Tekrar adedi"
          name="repeatCount"
          type="number"
          min={1}
          max={52}
          defaultValue={1}
        />
        <Field
          label="Tekrar aralığı (gün)"
          name="intervalDays"
          type="number"
          min={1}
          max={365}
          defaultValue={7}
        />
        <label className="grid gap-2 text-xs font-semibold">
          Kaynak
          <select
            name="source"
            className="h-11 rounded-xl border border-[#E2E2E8] bg-white px-3 font-normal"
          >
            <option value="walk_in">Walk-in</option>
            <option value="staff">Personel oluşturdu</option>
          </select>
        </label>
        <Button
          disabled={
            pending ||
            !initial.customers.length ||
            !initial.services.length ||
            !initial.employees.length
          }
          className="md:col-span-2 xl:col-span-4"
        >
          {pending ? (
            <LoaderCircle className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}{" "}
          Randevuları oluştur
        </Button>
      </form>
    </section>
  );
}

function Waitlist({
  initial,
  pending,
  run,
}: {
  initial: OperationsData;
  pending: boolean;
  run: Runner;
}) {
  const request = useRef<{ fingerprint: string; key: string } | null>(null);
  const statusKeys = useRef(new Map<string, string>());
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const changeStatus = (item: OperationsData["waitlist"][number], status: "accepted" | "cancelled") => {
    if (pending) return;
    if (status === "cancelled" && !window.confirm("Bu bekleme talebini iptal etmek istiyor musunuz?")) return;
    const fingerprint = JSON.stringify([initial.scopeKey, item.id, status, item.updated_at]);
    let key = statusKeys.current.get(fingerprint);
    if (!key) {
      key = crypto.randomUUID();
      statusKeys.current.set(fingerprint, key);
    }
    run(() => setWaitlistStatus(item.id, status, item.updated_at, key));
  };
  return (
    <div className="mt-4 grid gap-4 xl:grid-cols-[.7fr_1.3fr]">
      <form
        className="surface p-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (pending) return;
          const form = new FormData(event.currentTarget);
          const payload = {
              customerId: String(form.get("customer")),
              serviceId: String(form.get("service")),
              employeeId: String(form.get("employee") || "") || undefined,
              desiredFrom: toIso(form.get("from")),
              desiredTo: toIso(form.get("to")),
              partySize: Number(form.get("partySize")),
              notes: String(form.get("notes") ?? ""),
          };
          const fingerprint = JSON.stringify([initial.scopeKey, payload]);
          if (request.current?.fingerprint !== fingerprint)
            request.current = { fingerprint, key: crypto.randomUUID() };
          const key = request.current.key;
          run(async () => {
            const result = await createWaitlistEntry({ ...payload, idempotencyKey: key });
            if (result.ok) request.current = null;
            return result;
          });
        }}
      >
        <h2 className="font-semibold">Talep ekle</h2>
        <div className="mt-4 grid gap-4">
          <Select label="Müşteri" name="customer" items={initial.customers} />
          <Select label="Hizmet" name="service" items={initial.services} />
          <label className="grid gap-2 text-xs font-semibold">
            Tercih edilen çalışan
            <select
              name="employee"
              className="h-11 rounded-xl border border-[#E2E2E8] bg-white px-3 font-normal"
            >
              <option value="">Fark etmez</option>
              {initial.employees.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <Field label="En erken" name="from" type="datetime-local" required />
          <Field label="En geç" name="to" type="datetime-local" required />
          <Field
            label="Kişi"
            name="partySize"
            type="number"
            min={1}
            max={50}
            defaultValue={1}
          />
          <Field label="Not" name="notes" />
          <Button disabled={pending || !initial.customers.length || !initial.services.length}>Bekleme listesine ekle</Button>
        </div>
      </form>
      <section className="surface overflow-hidden">
        <div className="border-b border-[#ECECF1] p-5">
          <h2 className="font-semibold">Aktif sıra</h2>
          <p className="text-xs text-[#686872]">
            Teklif hazırlamak veya kabul etmek saat ayırmaz, randevu oluşturmaz ve ileti göndermez.
          </p>
        </div>
        <div className="divide-y divide-[#ECECF1]">
          {initial.waitlist.map((item) => (
            <div
              key={item.id}
              className="flex flex-wrap items-center gap-3 p-4 text-xs"
            >
              <UsersRound className="h-4 w-4 text-[#6C4BF4]" />
              <div className="min-w-[180px] flex-1">
                <strong>{one(item.customers)?.full_name ?? "Müşteri"}</strong>
                <span className="block text-[#686872]">
                  {one(item.services)?.name} · {item.party_size} kişi
                </span>
              </div>
              <span>
                {formatDate(item.desired_from)} – {formatDate(item.desired_to)}
              </span>
              <span className="rounded-full bg-[#F0ECFF] px-2 py-1">
                {item.status === "offered" ? (new Date(item.offer_expires_at ?? "").getTime() > now ? "Teklif hazırlandı" : "Teklif süresi doldu") : "Bekliyor"}
              </span>
              {item.status === "offered" && new Date(item.offer_expires_at ?? "").getTime() > now && new Date(item.offered_starts_at ?? "").getTime() > now && <button
                disabled={pending}
                onClick={() => changeStatus(item, "accepted")}
                className="font-semibold text-[#168A48]"
              >
                Kabul
              </button>}
              <button
                disabled={pending}
                onClick={() => changeStatus(item, "cancelled")}
                className="font-semibold text-red-600"
              >
                İptal
              </button>
            </div>
          ))}
          {!initial.waitlist.length && <Empty text="Bekleyen müşteri yok." />}
        </div>
      </section>
    </div>
  );
}

function Resources({
  initial,
  pending,
  run,
}: {
  initial: OperationsData;
  pending: boolean;
  run: Runner;
}) {
  const request = useRef<{ fingerprint: string; key: string } | null>(null);
  return (
    <div className="mt-4 grid gap-4 xl:grid-cols-[.7fr_1.3fr]">
      <form
        className="surface p-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (pending) return;
          const form = new FormData(event.currentTarget);
          const payload = {
              name: String(form.get("name")),
              kind: String(form.get("kind")) as
                | "room"
                | "chair"
                | "device"
                | "other",
              capacity: Number(form.get("capacity")),
              serviceIds: form.getAll("services").map(String),
              active: true,
          };
          const fingerprint = JSON.stringify([initial.scopeKey, payload]);
          if (request.current?.fingerprint !== fingerprint)
            request.current = { fingerprint, key: crypto.randomUUID() };
          const key = request.current.key;
          run(async () => {
            const result = await saveBusinessResource({ ...payload, requestId: key });
            if (result.ok) request.current = null;
            return result;
          });
        }}
      >
        <h2 className="flex items-center gap-2 font-semibold">
          <Wrench className="h-4 w-4" /> Kaynak ekle
        </h2>
        <div className="mt-4 grid gap-4">
          <Field
            label="Kaynak adı"
            name="name"
            placeholder="Örn. Lazer odası 1"
            required
          />
          <label className="grid gap-2 text-xs font-semibold">
            Tür
            <select
              name="kind"
              className="h-11 rounded-xl border border-[#E2E2E8] bg-white px-3 font-normal"
            >
              <option value="room">Oda</option>
              <option value="chair">Koltuk</option>
              <option value="device">Cihaz</option>
              <option value="other">Diğer</option>
            </select>
          </label>
          <Field
            label="Kapasite"
            name="capacity"
            type="number"
            min={1}
            max={100}
            defaultValue={1}
          />
          <fieldset>
            <legend className="text-xs font-semibold">Bağlı hizmetler</legend>
            <div className="mt-2 grid gap-2">
              {initial.services.map((service) => (
                <label key={service.id} className="flex gap-2 text-xs">
                  <input
                    type="checkbox"
                    name="services"
                    value={service.id}
                    className="accent-[#6C4BF4]"
                  />
                  {service.name}
                </label>
              ))}
            </div>
          </fieldset>
          <Button disabled={pending}>Kaynağı kaydet</Button>
        </div>
      </form>
      <section className="surface p-5">
        <h2 className="font-semibold">Oda, koltuk ve cihazlar</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {initial.resources.map((item) => (
            <div
              key={item.id}
              className="rounded-2xl border border-[#E8E8EE] p-4"
            >
              <div className="flex justify-between">
                <strong className="text-sm">{item.name}</strong>
                <span className="text-xs text-[#686872]">{item.kind}</span>
              </div>
              <p className="mt-2 text-xs text-[#686872]">
                Kapasite {item.capacity} · {item.service_resources?.length ?? 0}{" "}
                hizmet
              </p>
            </div>
          ))}
          {!initial.resources.length && (
            <Empty text="Henüz kaynak tanımlanmadı." />
          )}
        </div>
      </section>
    </div>
  );
}

function Growth({
  initial,
  pending,
  run,
}: {
  initial: OperationsData;
  pending: boolean;
  run: Runner;
}) {
  const base = typeof window === "undefined" ? "" : window.location.origin;
  return (
    <div className="mt-4 grid gap-4 xl:grid-cols-2">
      <section className="surface p-5">
        <h2 className="flex items-center gap-2 font-semibold">
          <Link2 className="h-4 w-4" /> Rezervasyon linkleri ve dönüşüm
        </h2>
        <form
          className="mt-4 grid gap-3 sm:grid-cols-2"
          action={(form) =>
            run(() =>
              createBookingLink({
                label: String(form.get("label")),
                serviceId: String(form.get("service") || "") || undefined,
                source: String(form.get("source")),
                campaign: String(form.get("campaign") ?? ""),
              }),
            )
          }
        >
          <Field
            label="Etiket"
            name="label"
            placeholder="Instagram bio"
            required
          />
          <Field
            label="Kaynak"
            name="source"
            defaultValue="instagram"
            required
          />
          <label className="grid gap-2 text-xs font-semibold">
            Hizmet
            <select
              name="service"
              className="h-11 rounded-xl border border-[#E2E2E8] bg-white px-3 font-normal"
            >
              <option value="">Tüm hizmetler</option>
              {initial.services.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <Field label="Kampanya" name="campaign" placeholder="eylul" />
          <Button disabled={pending} className="sm:col-span-2">
            Link oluştur
          </Button>
        </form>
        <div className="mt-5 grid gap-2">
          {initial.links.map((link) => {
            const url = `${base}/r/${link.token}`;
            const widget = `<script async src="${base}/api/widget/${link.token}"></script>`;
            return (
              <div
                key={link.id}
                className="rounded-xl bg-[#F8F8FA] p-3 text-xs"
              >
                <div className="flex gap-3">
                  <Image
                    src={`/api/qr?token=${link.token}`}
                    alt={`${link.label} rezervasyon QR kodu`}
                    width={72}
                    height={72}
                    unoptimized
                    className="h-[72px] w-[72px] rounded-lg border bg-white"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <strong>{link.label}</strong>
                      <button
                        onClick={() => void navigator.clipboard.writeText(url)}
                        aria-label="Linki kopyala"
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                    </div>
                    <span className="mt-1 block truncate text-[#686872]">
                      {url}
                    </span>
                    <span className="mt-2 block">
                      {link.visits} ziyaret · {link.conversions} dönüşüm
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => void navigator.clipboard.writeText(widget)}
                  className="mt-3 flex items-center gap-1 font-semibold text-[#5B3BE7]"
                >
                  <Copy className="h-3.5 w-3.5" /> Web widget kodunu kopyala
                </button>
              </div>
            );
          })}
        </div>
      </section>
      <section className="surface p-5">
        <h2 className="flex items-center gap-2 font-semibold">
          <PackagePlus className="h-4 w-4" /> Sadakat ve hizmet paketleri
        </h2>
        <p className="mt-1 text-xs text-[#686872]">
          Puan/katman hesapları müşteri bazında, paketler kalan seansla tutulur.
        </p>
        <form
          className="mt-4 grid gap-3 sm:grid-cols-2"
          action={(form) =>
            run(() =>
              createServicePackage({
                name: String(form.get("name")),
                serviceId: String(form.get("service") || "") || undefined,
                sessionCount: Number(form.get("sessions")),
                validityDays: Number(form.get("days")),
              }),
            )
          }
        >
          <Field label="Paket adı" name="name" required />
          <Select label="Hizmet" name="service" items={initial.services} />
          <Field
            label="Seans"
            name="sessions"
            type="number"
            min={1}
            max={1000}
            defaultValue={5}
          />
          <Field
            label="Geçerlilik (gün)"
            name="days"
            type="number"
            min={1}
            max={3650}
            defaultValue={365}
          />
          <Button disabled={pending} className="sm:col-span-2">
            Paket oluştur
          </Button>
        </form>
        <div className="mt-5 grid gap-2">
          {initial.packages.map((item) => (
            <div
              key={item.id}
              className="flex justify-between rounded-xl bg-[#F8F8FA] p-3 text-xs"
            >
              <strong>{item.name}</strong>
              <span>
                {item.session_count} seans · {item.validity_days} gün
              </span>
            </div>
          ))}
        </div>
        {!!initial.packages.length && !!initial.customers.length && (
          <form
            className="mt-5 grid gap-3 border-t border-[#ECECF1] pt-5 sm:grid-cols-2"
            action={(form) =>
              run(() =>
                assignServicePackage({
                  customerId: String(form.get("packageCustomer")),
                  packageId: String(form.get("packageId")),
                }),
              )
            }
          >
            <Select
              label="Müşteri"
              name="packageCustomer"
              items={initial.customers}
            />
            <Select label="Paket" name="packageId" items={initial.packages} />
            <Button
              disabled={pending}
              variant="secondary"
              className="sm:col-span-2"
            >
              Paketi müşteriye tanımla
            </Button>
          </form>
        )}
      </section>
    </div>
  );
}

function ImportPanel({ pending, run }: { pending: boolean; run: Runner }) {
  const [fileName, setFileName] = useState("");
  return (
    <section className="surface mt-4 p-6">
      <Upload className="h-7 w-7 text-[#6C4BF4]" />
      <h2 className="mt-3 font-semibold">CSV müşteri içe aktarma</h2>
      <p className="mt-1 text-sm text-[#686872]">
        Virgül veya noktalı virgül desteklenir. Zorunlu sütunlar: Ad Soyad,
        Telefon. En fazla 5.000 satır.
      </p>
      <label className="mt-5 flex cursor-pointer items-center justify-center rounded-2xl border-2 border-dashed border-[#D9D3F7] p-10 text-center text-sm">
        <input
          className="sr-only"
          type="file"
          accept=".csv,text/csv"
          disabled={pending}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            setFileName(file.name);
            void file
              .text()
              .then((text) => {
                const rows = parseCustomerCsv(text);
                run(() => importCustomers(rows));
              })
              .catch((error: unknown) =>
                alert(
                  error instanceof Error ? error.message : "Dosya okunamadı",
                ),
              );
          }}
        />
        <span>
          {pending ? "İçe aktarılıyor..." : fileName || "CSV dosyasını seç"}
        </span>
      </label>
      <a
        download="salonny-musteri-sablonu.csv"
        href={
          "data:text/csv;charset=utf-8,%EF%BB%BFAd%20Soyad%2CTelefon%2CE-posta%2CNotlar%2CPazarlama%20%C4%B0zni%0A"
        }
        className="mt-4 inline-flex text-xs font-semibold text-[#5B3BE7]"
      >
        Örnek şablonu indir
      </a>
    </section>
  );
}

function Permissions({
  initial,
  pending,
  run,
}: {
  initial: OperationsData;
  pending: boolean;
  run: Runner;
}) {
  const permissionKeys = [
    ["calendar", "Takvim"],
    ["customers", "Müşteriler"],
    ["campaigns", "Kampanyalar"],
    ["inventory", "Stok"],
    ["reports", "Raporlar"],
    ["operations", "Operasyonlar"],
  ] as const;
  return (
    <section className="surface mt-4 overflow-hidden">
      <div className="border-b border-[#ECECF1] p-5">
        <h2 className="font-semibold">Rol ve görünürlük matrisi</h2>
        <p className="mt-1 text-xs text-[#686872]">
          İşletme sahibi, çalışanların müşteri ve finans erişimini ayrı ayrı
          sınırlar.
        </p>
      </div>
      <div className="divide-y divide-[#ECECF1]">
        {initial.members.map((member) => {
          const user = one(member.users);
          const current = one(member.business_member_permissions);
          return (
            <form
              key={member.user_id}
              className="grid gap-4 p-5 lg:grid-cols-[1fr_180px_140px_2fr_auto] lg:items-end"
              action={(form) =>
                run(() =>
                  saveMemberPermissions({
                    userId: member.user_id,
                    customerVisibility: String(
                      form.get("customerVisibility"),
                    ) as "all" | "assigned" | "none",
                    financialVisibility:
                      form.get("financialVisibility") === "on",
                    permissions: Object.fromEntries(
                      permissionKeys.map(([key]) => [
                        key,
                        form.get(key) === "on",
                      ]),
                    ),
                  }),
                )
              }
            >
              <div>
                <strong className="text-sm">
                  {user?.full_name || user?.email || "Kullanıcı"}
                </strong>
                <span className="mt-1 block text-xs text-[#686872]">
                  {member.role}
                </span>
              </div>
              <label className="grid gap-2 text-xs font-semibold">
                Müşteri görünürlüğü
                <select
                  name="customerVisibility"
                  defaultValue={
                    current?.customer_visibility ??
                    (member.role === "EMPLOYEE" ? "assigned" : "all")
                  }
                  className="h-10 rounded-xl border border-[#E2E2E8] bg-white px-3 font-normal"
                >
                  <option value="all">Tümü</option>
                  <option value="assigned">Atanmış olanlar</option>
                  <option value="none">Kapalı</option>
                </select>
              </label>
              <label className="flex h-10 items-center gap-2 text-xs">
                <input
                  name="financialVisibility"
                  type="checkbox"
                  defaultChecked={
                    current?.financial_visibility ?? member.role !== "EMPLOYEE"
                  }
                  className="accent-[#6C4BF4]"
                />{" "}
                Finans verisi
              </label>
              <fieldset>
                <legend className="text-xs font-semibold">
                  Modül izinleri
                </legend>
                <div className="mt-2 flex flex-wrap gap-3">
                  {permissionKeys.map(([key, label]) => (
                    <label key={key} className="flex gap-1.5 text-xs">
                      <input
                        name={key}
                        type="checkbox"
                        defaultChecked={
                          current?.permissions?.[key] ??
                          (member.role !== "EMPLOYEE" ||
                            key === "calendar" ||
                            key === "customers")
                        }
                        className="accent-[#6C4BF4]"
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </fieldset>
              <Button
                disabled={pending || member.role === "OWNER"}
                variant="secondary"
              >
                Kaydet
              </Button>
            </form>
          );
        })}
      </div>
    </section>
  );
}

function Select({
  label,
  name,
  items,
}: {
  label: string;
  name: string;
  items: Named[];
}) {
  return (
    <label className="grid gap-2 text-xs font-semibold">
      {label}
      <select
        name={name}
        required
        className="h-11 rounded-xl border border-[#E2E2E8] bg-white px-3 font-normal"
      >
        <option value="">Seçin</option>
        {items.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
    </label>
  );
}
function Field({
  label,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="grid gap-2 text-xs font-semibold">
      {label}
      <input
        {...props}
        className="h-11 rounded-xl border border-[#E2E2E8] px-3 font-normal outline-none focus:border-[#6C4BF4]"
      />
    </label>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <div className="grid min-h-32 place-items-center text-center text-sm text-[#686872]">
      <ClipboardList className="mb-2 h-5 w-5" />
      {text}
    </div>
  );
}
