"use client";

import { Clock3, Pencil, Plus, Search, Scissors, ToggleLeft, ToggleRight, X } from "lucide-react";
import { cloneElement, useMemo, useState, useTransition } from "react";
import { saveService, setServiceActive } from "@/app/business/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export type ManagedService = { id: string; name: string; description: string; category: string; durationMinutes: number; price: number; bufferBeforeMinutes: number; bufferAfterMinutes: number; active: boolean; employeeIds: string[] };
export type ServiceEmployee = { id: string; name: string; active: boolean };

const emptyService: Omit<ManagedService, "id"> = { name: "", description: "", category: "Genel", durationMinutes: 30, price: 0, bufferBeforeMinutes: 0, bufferAfterMinutes: 0, active: true, employeeIds: [] };

export function BusinessServicesManager({ initialServices, employees }: { initialServices: ManagedService[]; employees: ServiceEmployee[] }) {
  const [services, setServices] = useState(initialServices);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<ManagedService | null | "new">(null);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const filtered = useMemo(() => services.filter((service) => `${service.name} ${service.category}`.toLocaleLowerCase("tr-TR").includes(query.toLocaleLowerCase("tr-TR"))), [services, query]);
  const selected = editing === "new" ? emptyService : editing;

  function submit(form: FormData) {
    const input = {
      id: editing && editing !== "new" ? editing.id : undefined,
      name: String(form.get("name") ?? ""), description: String(form.get("description") ?? ""), category: String(form.get("category") ?? "Genel"),
      durationMinutes: Number(form.get("durationMinutes")), price: Number(form.get("price")), bufferBeforeMinutes: Number(form.get("bufferBeforeMinutes")),
      bufferAfterMinutes: Number(form.get("bufferAfterMinutes")), employeeIds: form.getAll("employeeIds").map(String), active: form.get("active") === "on",
    };
    startTransition(async () => {
      const result = await saveService(input); setMessage(result.message); if (!result.ok) return;
      const item = { ...input, id: input.id ?? result.id! } as ManagedService;
      setServices((items) => input.id ? items.map((old) => old.id === input.id ? item : old) : [...items, item]); setEditing(null);
    });
  }

  function toggle(service: ManagedService) {
    startTransition(async () => { const result = await setServiceActive(service.id, !service.active); setMessage(result.message); if (result.ok) setServices((items) => items.map((item) => item.id === service.id ? { ...item, active: !item.active } : item)); });
  }

  return <div className="mx-auto max-w-[1200px]">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-2xl font-bold tracking-[-.03em]">Hizmetler</h1><p className="mt-1 text-sm text-[#777781]">Fiyat, süre ve çalışan eşleşmelerini yönet.</p></div><Button onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> Yeni Hizmet</Button></div>
    {message && <p className="mt-4 rounded-xl bg-[#F0ECFF] px-4 py-3 text-xs text-[#5938DF]" role="status">{message}</p>}
    <div className="surface mt-6 overflow-hidden"><div className="border-b border-[#ECECF1] p-4"><label className="flex h-10 items-center gap-2 rounded-xl border border-[#E8E8EE] px-3"><Search className="h-4 w-4 text-[#8A8A94]" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Hizmet ara..." className="w-full text-xs outline-none" /></label></div>
      <div className="divide-y divide-[#ECECF1]">{filtered.map((service) => <article key={service.id} className="flex flex-wrap items-center gap-4 p-5"><span className="grid h-11 w-11 place-items-center rounded-xl bg-[#F0ECFF] text-[#6C4BF4]"><Scissors className="h-5 w-5" /></span><div className="min-w-[180px] flex-1"><div className="flex items-center gap-2"><strong className="text-sm">{service.name}</strong><Badge tone={service.active ? "green" : "gray"}>{service.active ? "Aktif" : "Pasif"}</Badge></div><span className="mt-1 block text-xs text-[#777781]">{service.category} · {service.employeeIds.length} çalışan</span></div><span className="flex items-center gap-1.5 text-xs text-[#777781]"><Clock3 className="h-4 w-4" /> {service.durationMinutes} dk</span><strong className="w-24 text-right text-sm">{new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(service.price)}</strong><button disabled={pending} aria-label="Durumu değiştir" onClick={() => toggle(service)}>{service.active ? <ToggleRight className="h-7 w-7 text-[#6C4BF4]" /> : <ToggleLeft className="h-7 w-7 text-[#A1A1AA]" />}</button><button aria-label="Hizmeti düzenle" onClick={() => setEditing(service)} className="rounded-lg p-2 hover:bg-[#F4F2FF]"><Pencil className="h-4 w-4" /></button></article>)}</div>
      {!filtered.length && <div className="grid min-h-52 place-items-center p-8 text-center"><div><h2 className="font-semibold">{services.length ? "Aramayla eşleşen hizmet yok" : "Henüz hizmet eklenmedi"}</h2><p className="mt-2 text-sm text-[#777781]">Yeni hizmet eklediğinde rezervasyon akışında görünür.</p></div></div>}
    </div>
    {selected && <div className="fixed inset-0 z-[80] grid place-items-center bg-black/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditing(null); }}><form action={submit} className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl"><div className="flex items-center justify-between"><h2 className="text-lg font-bold">{editing === "new" ? "Yeni hizmet" : "Hizmeti düzenle"}</h2><button type="button" onClick={() => setEditing(null)} aria-label="Kapat"><X className="h-5 w-5" /></button></div><div className="mt-5 grid gap-4 sm:grid-cols-2"><Field label="Hizmet adı"><input name="name" defaultValue={selected.name} required minLength={2} /></Field><Field label="Kategori"><input name="category" defaultValue={selected.category} required /></Field><Field label="Süre (dakika)"><input name="durationMinutes" type="number" min={5} max={1440} defaultValue={selected.durationMinutes} required /></Field><Field label="Fiyat (TL)"><input name="price" type="number" min={0} step="0.01" defaultValue={selected.price} required /></Field><Field label="Ön tampon (dk)"><input name="bufferBeforeMinutes" type="number" min={0} max={240} defaultValue={selected.bufferBeforeMinutes} /></Field><Field label="Son tampon (dk)"><input name="bufferAfterMinutes" type="number" min={0} max={240} defaultValue={selected.bufferAfterMinutes} /></Field></div><Field label="Açıklama" className="mt-4"><textarea name="description" defaultValue={selected.description} rows={3} /></Field><fieldset className="mt-4"><legend className="text-xs font-semibold">Bu hizmeti veren çalışanlar</legend><div className="mt-2 grid gap-2 sm:grid-cols-2">{employees.filter((employee) => employee.active).map((employee) => <label key={employee.id} className="flex items-center gap-2 rounded-xl border border-[#ECECF1] p-3 text-xs"><input name="employeeIds" value={employee.id} type="checkbox" defaultChecked={selected.employeeIds.includes(employee.id)} className="accent-[#6C4BF4]" />{employee.name}</label>)}</div></fieldset><label className="mt-4 flex items-center gap-2 text-sm"><input name="active" type="checkbox" defaultChecked={selected.active} className="accent-[#6C4BF4]" /> Rezervasyona açık</label><Button disabled={pending} className="mt-6 w-full">{pending ? "Kaydediliyor..." : "Kaydet"}</Button></form></div>}
  </div>;
}

function Field({ label, className = "", children }: { label: string; className?: string; children: React.ReactElement<{ className?: string }> }) {
  return <label className={`grid gap-2 text-xs font-semibold ${className}`}>{label}{cloneElement(children, { className: `min-h-11 rounded-xl border border-[#E2E2E8] px-3 py-2 font-normal outline-none focus:border-[#6C4BF4] ${children.props.className ?? ""}` })}</label>;
}
