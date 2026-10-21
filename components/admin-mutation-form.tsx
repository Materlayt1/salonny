"use client";

import { startTransition, useActionState, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { performAdminMutation } from "@/app/admin/mutations";
import type { AdminField, AdminMutationKind } from "@/lib/admin-mutation-types";

const subscribe = () => () => {};
export function AdminMutationForm({ kind, id, title, fields, expected, disabled = false }: { kind: AdminMutationKind; id: string; title: string; fields: AdminField[]; expected?: string; disabled?: boolean }) {
  const busy = useRef(false);
  const hydrated = useSyncExternalStore(subscribe, () => true, () => false);
  const [snapshot] = useState(expected);
  const [state, dispatch, pending] = useActionState(async (previous: { ok: boolean; message: string }, data: FormData) => {
    try { return await performAdminMutation(previous, data); } finally { busy.current = false; }
  }, { ok: false, message: "" });
  const [values, setValues] = useState<Record<string, string | boolean>>(() => Object.fromEntries(fields.map(field => [field.name, field.value])));
  const [review, setReview] = useState<FormData | null>(null);
  const titleId = useId();
  return <>
    <form aria-busy={pending} onSubmit={event => {
      event.preventDefault();
      if (!hydrated || pending || busy.current || disabled || state.ok) return;
      const data = new FormData(event.currentTarget);
      setReview(data);
    }}>
      <input type="hidden" name="kind" value={kind} /><input type="hidden" name="id" value={id} />
      {snapshot !== undefined && <input type="hidden" name="expected" value={snapshot} />}
      <fieldset disabled={!hydrated || pending || disabled || state.ok} className="grid gap-4 disabled:opacity-60">
        <legend className="mb-3 font-semibold">{title}</legend>
        {fields.map(field => <label key={field.name} className="grid gap-2 text-xs font-medium">
          {field.label}
          {field.options ? <select name={field.name} aria-label={field.label} value={String(values[field.name])} onChange={event => setValues(previous => ({ ...previous, [field.name]: event.target.value }))} className="min-h-11 min-w-0 rounded-xl border border-[#E2E2E8] bg-white px-3">{field.options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            : field.type === "checkbox" ? <><input type="hidden" name={field.name} value={String(Boolean(values[field.name]))} /><input aria-label={field.label} type="checkbox" checked={Boolean(values[field.name])} onChange={event => setValues(previous => ({ ...previous, [field.name]: event.target.checked }))} className="h-5 w-5 accent-[#6C4BF4]" /></>
              : <input aria-label={field.label} name={field.name} type={field.type ?? "text"} value={String(values[field.name])} onChange={event => setValues(previous => ({ ...previous, [field.name]: event.target.value }))} required={field.required} maxLength={field.maxLength} min={field.min} max={field.max} pattern={field.pattern} className="min-h-11 min-w-0 rounded-xl border border-[#E2E2E8] px-3 font-normal" />}
        </label>)}
        <button type="submit" className="min-h-11 rounded-xl bg-[#6C4BF4] px-4 text-sm font-medium text-white">{pending ? "Kaydediliyor…" : "Değişikliği incele"}</button>
      </fieldset>
      {state.message && !pending && <p role={state.ok ? "status" : "alert"} className={`mt-4 rounded-xl p-3 text-xs leading-5 ${state.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>{state.message}</p>}
      {state.ok && <p className="mt-2 text-xs text-[#686872]">Başka işlem yapmadan önce yukarıdaki “Listeyi yenile” bağlantısıyla güncel kaydı yükle.</p>}
      <noscript>İşlem onayı için JavaScript gerekir. Veriler salt-okunur gösteriliyor.</noscript>
    </form>
    {review && <AdminConfirmation titleId={titleId} close={() => setReview(null)}>
      <h2 id={titleId} className="text-lg font-semibold">İşlemi onayla</h2>
      <p className="mt-3 break-words text-sm font-medium">{title}</p><p className="mt-1 break-all text-xs text-[#686872]">Kayıt: {id || "Yeni kategori"}</p>
      <dl className="my-4 grid gap-2 text-sm">{fields.map(field => { const value = String(review.get(field.name) ?? ""); return <div key={field.name}><dt className="text-xs text-[#686872]">{field.label}</dt><dd className="break-words">{field.options?.find(([key]) => key === value)?.[1] ?? (field.type === "checkbox" ? value === "true" ? "Evet" : "Hayır" : value || "—")}</dd></div>; })}</dl>
      <p className="rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">Bu işlem gerçek platform verisini değiştirir. {kind === "category" ? "Mevcut kategori işlevi ayrı denetim geçmişi üretmez." : "Mevcut veritabanı denetim kaydına yazılır."} {kind === "user" && "Bu profil rolüdür; işletme/şube üyeliği ataması değildir."} Emin değilsen vazgeç.</p>
      <div className="mt-5 flex flex-wrap gap-3"><button type="button" onClick={() => setReview(null)} className="min-h-11 rounded-xl border px-4 text-sm">Vazgeç</button><button type="button" onClick={() => {
        if (busy.current) return;
        busy.current = true;
        const data = review;
        setReview(null);
        startTransition(() => dispatch(data));
      }} className="min-h-11 rounded-xl bg-[#6C4BF4] px-4 text-sm font-medium text-white">Onayla ve uygula</button></div>
    </AdminConfirmation>}
  </>;
}
function AdminConfirmation({ children, titleId, close }: { children: React.ReactNode; titleId: string; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    ref.current?.showModal(); const dialog = ref.current;
    return () => { dialog?.close(); if (trigger?.isConnected) trigger.focus({ preventScroll: true }); };
  }, []);
  return <dialog ref={ref} aria-labelledby={titleId} className="m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-lg overflow-y-auto overscroll-contain rounded-3xl bg-white p-6 text-[#20202A] backdrop:bg-black/45" onCancel={event => { event.preventDefault(); close(); }}>{children}</dialog>;
}
