import { AdminWorkspace } from "@/components/admin-workspace";
import { requireAdminSession } from "@/lib/admin-access";
import { readAdminDirectory, readAdminOverview, type AdminDirectoryResult } from "@/lib/admin-directory";
import { parseAdminQuery } from "@/lib/admin-directory-query";

export default async function AdminPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requireAdminSession();
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) search.append(key, item);
  let query;
  try { query = parseAdminQuery(search); }
  catch { return <AdminWorkspace name={session.name} userId={session.user.id} query={parseAdminQuery(new URLSearchParams())} error="Filtre veya sayfa bağlantısı geçersiz. Filtreleri yeniden seç; kayıt sorgusu çalıştırılmadı." />; }
  let directory: AdminDirectoryResult | undefined, overview: number[] | undefined, error: string | undefined;
  try {
    if (query.section === "overview") overview = await readAdminOverview(session.client);
    else directory = await readAdminDirectory(session.client, query);
  } catch { error = "Yönetim verileri şu anda alınamadı. Bu, boş liste veya sıfır toplam anlamına gelmiyor. Listeyi yenileyerek tekrar dene."; }
  return <AdminWorkspace query={query} name={session.name} userId={session.user.id} directory={directory} overview={overview} error={error} />;
}
