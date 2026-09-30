import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createServerClientOptional } from "@/lib/supabase/server";
import { assertRateLimit } from "@/lib/rate-limit";

export type BusinessMemberRole = "OWNER" | "MANAGER" | "EMPLOYEE";
export type BusinessPermission =
  | "calendar"
  | "customers"
  | "campaigns"
  | "inventory"
  | "reports"
  | "operations";

type MemberPermissionRow = {
  permissions: Record<string, boolean> | null;
  customer_visibility: "all" | "assigned" | "none";
  financial_visibility: boolean;
};

export type BusinessContext = {
  supabase: NonNullable<Awaited<ReturnType<typeof createServerClientOptional>>>;
  user: { id: string; email?: string; fullName?: string };
  role: BusinessMemberRole;
  permissions: Record<BusinessPermission, boolean>;
  customerVisibility: "all" | "assigned" | "none";
  financialVisibility: boolean;
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
  branches: { id: string; name: string; timezone: string }[];
};

export const getBusinessContext = cache(
  async (): Promise<BusinessContext | null> => {
    const supabase = await createServerClientOptional();
    if (!supabase) return null;

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) return null;

    const { data: membership, error: membershipError } = await supabase
      .from("business_members")
      .select(
        "business_id,role,business_member_permissions(permissions,customer_visibility,financial_visibility)",
      )
      .eq("user_id", user.id)
      .eq("active", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (membershipError || !membership) return null;

    const [
      { data: business, error: businessError },
      { data: branchRows, error: branchError },
    ] = await Promise.all([
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
        .limit(100),
    ]);
    if (businessError || branchError || !business || !branchRows?.length)
      return null;
    const selectedBranchId = (await cookies()).get("salonny_branch_id")?.value;
    const branch =
      branchRows.find((item) => item.id === selectedBranchId) ?? branchRows[0];

    const role = membership.role as BusinessMemberRole;
    const permissionRelation =
      membership.business_member_permissions as unknown;
    const permissionRow = (
      Array.isArray(permissionRelation)
        ? permissionRelation[0]
        : permissionRelation
    ) as MemberPermissionRow | null;
    const elevated = role === "OWNER" || role === "MANAGER";
    const defaults: Record<BusinessPermission, boolean> = {
      calendar: true,
      customers: true,
      campaigns: elevated,
      inventory: elevated,
      reports: elevated,
      operations: elevated,
    };
    const permissions = Object.fromEntries(
      Object.entries(defaults).map(([key, fallback]) => [
        key,
        elevated || (permissionRow?.permissions?.[key] ?? fallback),
      ]),
    ) as Record<BusinessPermission, boolean>;

    return {
      supabase,
      user: {
        id: user.id,
        email: user.email,
        fullName:
          typeof user.user_metadata.full_name === "string"
            ? user.user_metadata.full_name
            : undefined,
      },
      role,
      permissions,
      customerVisibility: elevated
        ? "all"
        : (permissionRow?.customer_visibility ?? "assigned"),
      financialVisibility:
        elevated || (permissionRow?.financial_visibility ?? false),
      business,
      branch,
      branches: branchRows,
    };
  },
);

export async function requireBusinessContext(
  allowedRoles?: BusinessMemberRole[],
) {
  const context = await getBusinessContext();
  if (!context) {
    const supabase = await createServerClientOptional();
    const {
      data: { user },
    } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
    if (user) redirect("/business/onboarding");
    redirect("/auth/login?next=/business/dashboard&account=business");
  }
  if (allowedRoles && !allowedRoles.includes(context.role))
    redirect("/business/dashboard");
  return context;
}

export async function requireBusinessPermission(
  permission: BusinessPermission,
  allowedRoles?: BusinessMemberRole[],
) {
  const context = await requireBusinessContext(allowedRoles);
  if (!context.permissions[permission]) redirect("/business/dashboard");
  return context;
}

export async function requireBusinessMutation(
  allowedRoles: BusinessMemberRole[] = ["OWNER", "MANAGER"],
) {
  const context = await getBusinessContext();
  if (!context) throw new Error("Oturum doğrulanamadı.");
  if (!allowedRoles.includes(context.role))
    throw new Error("Bu işlem için yetkiniz yok.");
  await assertRateLimit(`business-action:${context.user.id}`, 120, 60_000, {
    failClosed: true,
  });
  return context;
}

export async function requireBusinessPermissionMutation(
  permission: BusinessPermission,
  allowedRoles: BusinessMemberRole[] = ["OWNER", "MANAGER", "EMPLOYEE"],
) {
  const context = await requireBusinessMutation(allowedRoles);
  if (!context.permissions[permission])
    throw new Error("Bu işlem için yetkiniz yok.");
  return context;
}
