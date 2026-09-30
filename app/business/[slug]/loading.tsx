export default function BusinessDetailLoading() {
  return (
    <main className="min-h-screen animate-pulse bg-[#F8F8FA] pb-24">
      <div className="h-16 border-b border-[#ECECF1] bg-white" />
      <div className="container-shell py-4">
        <div className="h-3 w-44 rounded-full bg-[#E8E6F0]" />
      </div>
      <section className="container-shell grid gap-3 md:grid-cols-[minmax(0,2fr)_minmax(240px,1fr)]">
        <div className="h-[230px] bg-[#E6E3EF] max-md:-mx-3 md:h-[350px] md:rounded-[24px]" />
        <div className="hidden h-[350px] rounded-[20px] bg-[#ECEAF3] md:block" />
      </section>
      <section className="container-shell mt-5 grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div>
          <div className="h-9 w-48 rounded-xl bg-[#E4E1ED]" />
          <div className="mt-3 h-4 w-72 max-w-full rounded-full bg-[#ECEAF3]" />
          <div className="mt-6 h-12 rounded-xl bg-white" />
          <div className="mt-7 h-56 rounded-[20px] bg-white" />
        </div>
        <div className="hidden h-48 rounded-[20px] bg-white lg:block" />
      </section>
    </main>
  );
}
