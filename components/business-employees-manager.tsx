"use client";

import { CalendarClock, CalendarOff, Pencil, Plus, Search, ToggleLeft, ToggleRight, Trash2, UserRound, X } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { addEmployeeTimeOff, removeEmployeeTimeOff, saveEmployee, saveEmployeeSchedule, setEmployeeActive } from "@/app/business/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { initials } from "@/lib/format";

export type ManagedEmployee = { id: string; displayName: string; title: string; bio: string; active: boolean; serviceIds: string[] };
export type EmployeeService = { id: string; name: string; active: boolean };
export type EmployeeHour = { employeeId: string; weekday: number; startsAt: string; endsAt: string };
export type EmployeeTimeOff = { id: string; employeeId: string; startsAt: string; endsAt: string; kind: "leave" | "vacation" | "blocked" | "break"; note: string };

const emptyEmployee: Omit<ManagedEmployee, "id"> = { displayName: "", title: "", bio: "", active: true, serviceIds: [] };
const days = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];
const kindLabels: Record<EmployeeTimeOff["kind"], string> = { leave: "İzin", vacation: "Tatil", blocked: "Bloklu zaman", break: "Mola" };

export function BusinessEmployeesManager({
  initialEmployees,
  services,
  initialHours,
  initialTimeOff,
}: {
  initialEmployees: ManagedEmployee[];
  services: EmployeeService[];
  initialHours: EmployeeHour[];
  initialTimeOff: EmployeeTimeOff[];
}) {
  const [employees, setEmployees] = useState(initialEmployees);
  const [hours, setHours] = useState(initialHours);
  const [timeOff, setTimeOff] = useState(initialTimeOff);
  const [editing, setEditing] = useState<ManagedEmployee | "new" | null>(null);
  const [scheduleEditing, setScheduleEditing] = useState<ManagedEmployee | null>(null);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const filtered = useMemo(() => employees.filter((item) => `${item.displayName} ${item.title}`.toLocaleLowerCase("tr-TR").includes(query.toLocaleLowerCase("tr-TR"))), [employees, query]);
  const selected = editing === "new" ? emptyEmployee : editing;

  function submitEmployee(form: FormData) {
    const input = {
      id: editing && editing !== "new" ? editing.id : undefined,
      displayName: String(form.get("displayName") ?? ""),
      title: String(form.get("title") ?? ""),
      bio: String(form.get("bio") ?? ""),
      serviceIds: form.getAll("serviceIds").map(String),
      active: form.get("active") === "on",
    };
    startTransition(async () => {
      const result = await saveEmployee(input);
      setMessage(result.message);
      if (!result.ok) return;
      const item = { ...input, id: input.id ?? result.id! } as ManagedEmployee;
      setEmployees((items) => input.id ? items.map((old) => old.id === input.id ? item : old) : [...items, item]);
      setEditing(null);
    });
  }

  function toggle(item: ManagedEmployee) {
    startTransition(async () => {
      const result = await setEmployeeActive(item.id, !item.active);
      setMessage(result.message);
      if (result.ok) setEmployees((items) => items.map((old) => old.id === item.id ? { ...old, active: !old.active } : old));
    });
  }

  function submitSchedule(form: FormData) {
    if (!scheduleEditing) return;
    const periods = days.flatMap((_, weekday) => form.get(`open_${weekday}`) === "on" ? [{
      weekday,
      startsAt: String(form.get(`starts_${weekday}`) ?? "09:00"),
      endsAt: String(form.get(`ends_${weekday}`) ?? "19:00"),
    }] : []);
    startTransition(async () => {
      const result = await saveEmployeeSchedule(scheduleEditing.id, periods);
      setMessage(result.message);
      if (!result.ok) return;
      setHours((items) => [...items.filter((item) => item.employeeId !== scheduleEditing.id), ...periods.map((period) => ({ ...period, employeeId: scheduleEditing.id }))]);
    });
  }

  function submitTimeOff(form: FormData) {
    if (!scheduleEditing) return;
    const startsAt = new Date(String(form.get("startsAt") ?? ""));
    const endsAt = new Date(String(form.get("endsAt") ?? ""));
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
      setMessage("Geçerli bir başlangıç ve bitiş zamanı seç.");
      return;
    }
    const input = {
      employeeId: scheduleEditing.id,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      kind: String(form.get("kind") ?? "leave") as EmployeeTimeOff["kind"],
      note: String(form.get("note") ?? ""),
    };
    startTransition(async () => {
      const result = await addEmployeeTimeOff(input);
      setMessage(result.message);
      if (!result.ok || !result.id) return;
      setTimeOff((items) => [...items, { ...input, id: result.id! }].sort((a, b) => a.startsAt.localeCompare(b.startsAt)));
    });
  }

  function removeTimeOff(id: string) {
    startTransition(async () => {
      const result = await removeEmployeeTimeOff(id);
      setMessage(result.message);
      if (result.ok) setTimeOff((items) => items.filter((item) => item.id !== id));
    });
  }

  return <div className="mx-auto max-w-[1200px]">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-2xl font-bold">Çalışanlar</h1><p className="mt-1 text-sm text-[#777781]">Ekibini, hizmet yetkinliklerini, vardiyalarını ve izinlerini yönet.</p></div><Button onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> Çalışan Ekle</Button></div>
    {message && <p className="mt-4 rounded-xl bg-[#F0ECFF] px-4 py-3 text-xs text-[#5938DF]" role="status">{message}</p>}
    <label className="surface mt-6 flex h-12 items-center gap-2 px-4"><Search className="h-4 w-4 text-[#8A8A94]" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Çalışan ara..." className="flex-1 text-xs outline-none" /></label>
    <div className="mt-4 grid gap-4 md:grid-cols-2">{filtered.map((employee) => {
      const weeklyHours = hours.filter((hour) => hour.employeeId === employee.id);
      const upcomingTimeOff = timeOff.filter((item) => item.employeeId === employee.id).length;
      return <article key={employee.id} className="surface p-5"><div className="flex items-start gap-4"><span className="grid h-16 w-16 place-items-center rounded-2xl bg-[#F0ECFF] text-lg font-bold text-[#6542EA]">{initials(employee.displayName)}</span><div className="min-w-0 flex-1"><div className="flex items-start justify-between"><div><h2 className="font-semibold">{employee.displayName}</h2><p className="mt-1 text-xs text-[#777781]">{employee.title || "Uzman"}</p></div><button onClick={() => setEditing(employee)} aria-label={`${employee.displayName} bilgilerini düzenle`}><Pencil className="h-4 w-4" /></button></div><div className="mt-3 flex flex-wrap gap-2"><Badge tone={employee.active ? "green" : "gray"}>{employee.active ? "Aktif" : "Pasif"}</Badge><Badge tone="gray">{employee.serviceIds.length} hizmet</Badge><Badge tone="purple">{weeklyHours.length ? `${weeklyHours.length} gün` : "İşletme saati"}</Badge>{upcomingTimeOff > 0 && <Badge tone="amber">{upcomingTimeOff} izin/blok</Badge>}</div></div></div><div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#ECECF1] pt-4"><button onClick={() => setScheduleEditing(employee)} className="inline-flex items-center gap-2 text-xs font-semibold text-[#5B3BE7]"><CalendarClock className="h-4 w-4" /> Müsaitliği yönet</button><div className="flex items-center gap-2"><span className="text-xs text-[#777781]">Rezervasyona açık</span><button disabled={pending} onClick={() => toggle(employee)} aria-label={`${employee.displayName} rezervasyon durumunu değiştir`}>{employee.active ? <ToggleRight className="h-7 w-7 text-[#6C4BF4]" /> : <ToggleLeft className="h-7 w-7 text-[#A1A1AA]" />}</button></div></div></article>;
    })}</div>
    {!filtered.length && <div className="surface mt-4 grid min-h-56 place-items-center p-8 text-center"><div><UserRound className="mx-auto h-8 w-8 text-[#9B8FEA]" /><h2 className="mt-3 font-semibold">{employees.length ? "Eşleşen çalışan yok" : "Henüz çalışan yok"}</h2><p className="mt-2 text-sm text-[#777781]">Müsaitlik oluşturmak için ilk çalışanını ekle.</p></div></div>}

    {selected && <Modal close={() => setEditing(null)}><form action={submitEmployee}><ModalHeader title={editing === "new" ? "Çalışan ekle" : "Çalışanı düzenle"} close={() => setEditing(null)} /><div className="mt-5 grid gap-4"><Input label="Ad soyad" name="displayName" defaultValue={selected.displayName} required /><Input label="Görev / ünvan" name="title" defaultValue={selected.title} /><label className="grid gap-2 text-xs font-semibold">Kısa biyografi<textarea name="bio" defaultValue={selected.bio} rows={3} maxLength={1000} className="rounded-xl border border-[#E2E2E8] p-3 font-normal outline-none focus:border-[#6C4BF4]" /></label></div><fieldset className="mt-4"><legend className="text-xs font-semibold">Verdiği hizmetler</legend><div className="mt-2 grid gap-2 sm:grid-cols-2">{services.filter((service) => service.active).map((service) => <label key={service.id} className="flex gap-2 rounded-xl border border-[#ECECF1] p-3 text-xs"><input name="serviceIds" value={service.id} type="checkbox" defaultChecked={selected.serviceIds.includes(service.id)} className="accent-[#6C4BF4]" />{service.name}</label>)}</div></fieldset><label className="mt-4 flex gap-2 text-sm"><input name="active" type="checkbox" defaultChecked={selected.active} className="accent-[#6C4BF4]" /> Rezervasyona açık</label><Button disabled={pending} className="mt-6 w-full">{pending ? "Kaydediliyor..." : "Kaydet"}</Button></form></Modal>}

    {scheduleEditing && <Modal close={() => setScheduleEditing(null)} wide><ModalHeader title={`${scheduleEditing.displayName} · Müsaitlik`} close={() => setScheduleEditing(null)} /><form action={submitSchedule} className="mt-5"><h3 className="text-sm font-semibold">Haftalık vardiya</h3><p className="mt-1 text-xs text-[#777781]">Kapalı bırakılan günlerde çalışan için uygun saat üretilmez.</p><div className="mt-3 grid gap-2">{days.map((day, weekday) => {
      const existing = hours.find((hour) => hour.employeeId === scheduleEditing.id && hour.weekday === weekday);
      return <div key={day} className="flex flex-wrap items-center gap-3 rounded-xl border border-[#ECECF1] p-3"><label className="flex w-28 items-center gap-2 text-xs font-semibold"><input name={`open_${weekday}`} type="checkbox" defaultChecked={Boolean(existing)} className="accent-[#6C4BF4]" />{day}</label><input aria-label={`${day} başlangıç`} name={`starts_${weekday}`} type="time" defaultValue={existing?.startsAt ?? "09:00"} className="h-9 rounded-lg border px-2 text-xs" /><span className="text-xs text-[#888894]">–</span><input aria-label={`${day} bitiş`} name={`ends_${weekday}`} type="time" defaultValue={existing?.endsAt ?? "19:00"} className="h-9 rounded-lg border px-2 text-xs" /></div>;
    })}</div><Button disabled={pending} className="mt-4">Vardiyayı kaydet</Button></form><section className="mt-7 border-t border-[#ECECF1] pt-6"><div className="flex items-center gap-2"><CalendarOff className="h-4 w-4 text-[#6C4BF4]" /><h3 className="text-sm font-semibold">İzinler ve bloklu zamanlar</h3></div><div className="mt-3 grid gap-2">{timeOff.filter((item) => item.employeeId === scheduleEditing.id).map((item) => <article key={item.id} className="flex items-start gap-3 rounded-xl bg-[#F8F8FA] p-3"><div className="min-w-0 flex-1"><strong className="text-xs">{kindLabels[item.kind]}</strong><p className="mt-1 text-[11px] text-[#666672]">{formatDateTime(item.startsAt)} – {formatDateTime(item.endsAt)}</p>{item.note && <p className="mt-1 truncate text-[10px] text-[#888894]">{item.note}</p>}</div><button disabled={pending} onClick={() => removeTimeOff(item.id)} aria-label="İzin kaydını sil" className="rounded-lg p-2 text-[#C72C3B]"><Trash2 className="h-4 w-4" /></button></article>)}{!timeOff.some((item) => item.employeeId === scheduleEditing.id) && <p className="rounded-xl bg-[#F8F8FA] p-4 text-xs text-[#777781]">Yaklaşan izin veya blok yok.</p>}</div><form action={submitTimeOff} className="mt-4 grid gap-3 rounded-xl border border-dashed border-[#B9ACED] p-4 sm:grid-cols-2"><Input label="Başlangıç" name="startsAt" type="datetime-local" required /><Input label="Bitiş" name="endsAt" type="datetime-local" required /><label className="grid gap-2 text-xs font-semibold">Tür<select name="kind" className="h-11 rounded-xl border border-[#E2E2E8] bg-white px-3 font-normal"><option value="leave">İzin</option><option value="vacation">Tatil</option><option value="blocked">Bloklu zaman</option><option value="break">Mola</option></select></label><Input label="Not" name="note" maxLength={500} placeholder="İsteğe bağlı" /><Button disabled={pending} className="sm:col-span-2 sm:w-fit">İzin / blok ekle</Button></form></section></Modal>}
  </div>;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function Modal({ children, close, wide = false }: { children: React.ReactNode; close: () => void; wide?: boolean }) {
  return <div className="fixed inset-0 z-[80] grid place-items-center bg-black/40 p-4" onMouseDown={(event) => event.target === event.currentTarget && close()}><div role="dialog" aria-modal="true" className={`max-h-[92vh] w-full overflow-y-auto rounded-3xl bg-white p-6 ${wide ? "max-w-3xl" : "max-w-xl"}`}>{children}</div></div>;
}

function ModalHeader({ title, close }: { title: string; close: () => void }) {
  return <div className="flex justify-between gap-4"><h2 className="text-lg font-bold">{title}</h2><button type="button" onClick={close} aria-label="Pencereyi kapat"><X className="h-5 w-5" /></button></div>;
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const { label, ...inputProps } = props;
  return <label className="grid gap-2 text-xs font-semibold">{label}<input {...inputProps} className="h-11 rounded-xl border border-[#E2E2E8] px-3 font-normal outline-none focus:border-[#6C4BF4]" /></label>;
}
