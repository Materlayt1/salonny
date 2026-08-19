export function PageSkeleton({ dashboard = false }: { dashboard?: boolean }) {
  return (
    <div className={dashboard ? "min-h-screen bg-[#F8F8FA] p-5 md:pl-[272px] md:pt-24" : "container-shell min-h-[70vh] py-24"} aria-label="Sayfa yükleniyor" aria-busy="true">
      <div className="animate-pulse">
        <div className="h-7 w-52 rounded-lg bg-[#E9E7F1]" />
        <div className="mt-3 h-4 w-80 max-w-full rounded bg-[#EFEDF5]" />
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-32 rounded-2xl border border-[#ECEAF2] bg-white" />)}
        </div>
        <div className="mt-5 h-72 rounded-2xl border border-[#ECEAF2] bg-white" />
      </div>
    </div>
  );
}
