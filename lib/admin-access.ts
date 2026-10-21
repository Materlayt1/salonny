import "server-only";
import { redirect } from "next/navigation";
import { createServerClientOptional } from "@/lib/supabase/server";

export async function requireAdminSession() {
  const client = await createServerClientOptional({ dataTimeoutMs: 10_000, retry: false });
  if (!client) redirect("/admin/login");
  const auth = await client.auth.getUser();
  if (auth.error && (auth.error.status === undefined || auth.error.status === 429 || auth.error.status >= 500)) throw new Error("Yönetici oturumu doğrulanamadı. Yeniden dene.");
  if (!auth.data.user) redirect("/admin/login");
  const profile = await client.from("users").select("role,full_name,deleted_at").eq("id", auth.data.user.id).maybeSingle();
  if (profile.error) throw new Error("Yönetici yetkisi doğrulanamadı.");
  if (profile.data?.role !== "ADMIN" || profile.data.deleted_at) redirect("/admin/login?error=forbidden");
  return { client, user: auth.data.user, name: String(profile.data.full_name ?? "Platform yöneticisi") };
}
