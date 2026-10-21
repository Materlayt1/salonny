export default function AdminLoading() {
  return <main className="mx-auto max-w-5xl p-8" aria-busy="true"><p role="status" className="text-sm text-[#767080]">Yönetim çalışma alanı yükleniyor…</p><div className="mt-6 grid gap-4 sm:grid-cols-2">{[1, 2, 3, 4].map(key => <div key={key} className="h-36 rounded-2xl bg-[#F0EDF5]" />)}</div></main>;
}
