import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { createServerClientOptional } from "@/lib/supabase/server";

export type BusinessMemberRole = "OWNER" | "MANAGER" | "EMPLOYEE";

export type BusinessContext = {
  supabase: NonNullable<Awaited<ReturnType<typeof createServerClientOptional>>>;
  user: { id: string; email?: string; fullName?: string };
  role: BusinessMemberRole;
  business: {
    id: string;
    name: string;
    slug: string;
    status: string;
    timezone: string;
  };
  branch: {
    id: string;
    name: string;
    timezone: string;
  };
};

export const getBusinessContext = cache(async (): Promise<BusinessContext | null> => {
  const supabase = await createServerClientOptional();
  if (!supabase) return null;

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return null;

  const { data: membership, error: membershipError } = await supabase
    .from("business_members")
    .select("business_id,role")
    .eq("user_id", user.id)
    .eq("active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (membershipError || !membership) return null;

  const [{ data: business, error: businessError }, { data: branch, error: branchError }] = await Promise.all([
    supabase
      .from("businesses")
      .select("id,name,slug,status,timezone")
      .eq("id", membership.business_id)
      .maybeSingle(),
    supabase
      .from("branches")
      .select("id,name,timezone")
      .eq("business_id", membership.business_id)
      .eq("active", true)
      .order("is_primary", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);
  if (businessError || branchError || !business || !branch) return null;

  return {
    supabase,
    user: { id: user.id, email: user.email, fullName: typeof user.user_metadata.full_name === "string" ? user.user_metadata.full_name : undefined },
    role: membership.role as BusinessMemberRole,
    business,
    branch,
  };
});

export async function requireBusinessContext(allowedRoles?: BusinessMemberRole[]) {
  const context = await getBusinessContext();
  if (!context) {
    const supabase = await createServerClientOptional();
    const { data: { user } } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
    if (user) redirect("/business/onboarding");
    redirect("/auth/login?next=/business/dashboard&account=business");
  }
  if (allowedRoles && !allowedRoles.includes(context.role)) redirect("/business/dashboard");
  return context;
}

export async function requireBusinessMutation(allowedRoles: BusinessMemberRole[] = ["OWNER", "MANAGER"]) {
  const context = await getBusinessContext();
  if (!context) throw new Error("Oturum doğrulanamadı.");
  if (!allowedRoles.includes(context.role)) throw new Error("Bu işlem için yetkiniz yok.");
  return context;
}
