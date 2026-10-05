import "server-only";
import { createRequestClientOptional } from "@/lib/supabase/request";
import type { BusinessContext, BusinessMemberRole, BusinessPermission } from "@/lib/business-context";

export class BusinessAccessError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

/** Client IDs select a scope only after membership and branch ownership checks. */
export async function getBusinessRequestContext(request: Request): Promise<BusinessContext> {
  const client = await createRequestClientOptional(request);
  const user = client ? (await client.auth.getUser()).data.user : null;
  if (!client || !user) throw new BusinessAccessError("Giriş yapmalısın.", 401);
  const params = new URL(request.url).searchParams;
  const businessId = params.get("businessId");
  const branchId = params.get("branchId");
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if ((businessId && !uuid.test(businessId)) || (branchId && !uuid.test(branchId))) throw new BusinessAccessError("Geçersiz işletme veya şube.", 422);
  let query = client.from("business_members").select("business_id,role,business_member_permissions(permissions,customer_visibility,financial_visibility)").eq("user_id", user.id).eq("active", true);
  if (businessId) query = query.eq("business_id", businessId);
  const membership = await query.order("created_at").limit(1).maybeSingle();
  if (membership.error) throw new BusinessAccessError("İşletme bilgisi alınamadı.", 503);
  if (!membership.data) throw new BusinessAccessError("Bu hesapta yetkili bir işletme bulunamadı.", 403);
  const role = membership.data.role as BusinessMemberRole;
  if (!["OWNER", "MANAGER", "EMPLOYEE"].includes(role)) throw new BusinessAccessError("Bu işlem için yetkin yok.", 403);
  const [business, branches] = await Promise.all([
    client.from("businesses").select("id,name,slug,status,timezone").eq("id", membership.data.business_id).maybeSingle(),
    client.from("branches").select("id,name,timezone").eq("business_id", membership.data.business_id).eq("active", true).order("is_primary", { ascending: false }).order("created_at").limit(100),
  ]);
  if (business.error || branches.error) throw new BusinessAccessError("İşletme bilgisi alınamadı.", 503);
  if (!business.data || !branches.data?.length) throw new BusinessAccessError("Aktif işletme şubesi bulunamadı.", 403);
  const branch = branchId ? branches.data.find((item) => item.id === branchId) : branches.data[0];
  if (!branch) throw new BusinessAccessError("Bu şubeye erişimin yok.", 403);
  const relation = membership.data.business_member_permissions;
  const row = (Array.isArray(relation) ? relation[0] : relation) as { permissions?: Record<string, boolean>; customer_visibility?: "all" | "assigned" | "none"; financial_visibility?: boolean } | null;
  const elevated = role === "OWNER" || role === "MANAGER";
  const defaults = { calendar: true, customers: true, campaigns: elevated, inventory: elevated, reports: elevated, operations: elevated };
  const permissions = Object.fromEntries(Object.entries(defaults).map(([key, fallback]) => [key, elevated || (row?.permissions?.[key] ?? fallback)])) as Record<BusinessPermission, boolean>;
  return { supabase: client, user: { id: user.id, email: user.email, fullName: user.user_metadata.full_name }, role, permissions, customerVisibility: elevated ? "all" : row?.customer_visibility ?? "assigned", financialVisibility: elevated || Boolean(row?.financial_visibility), business: business.data, branch, branches: branches.data };
}

export function requirePanelPermission(context: BusinessContext, section: string, write = false) {
  const elevated = context.role === "OWNER" || context.role === "MANAGER";
  const permission: Record<string, BusinessPermission> = { appointments: "calendar", calendar: "calendar", customers: "customers", inventory: "inventory", campaigns: "campaigns", reports: "reports", operations: "operations" };
  if ((permission[section] && !context.permissions[permission[section]]) || (section === "customers" && context.customerVisibility === "none") || (section === "reports" && !context.financialVisibility)) throw new BusinessAccessError("Bu bölüm için yetkin yok.", 403);
  if (write && !elevated && section !== "appointments") throw new BusinessAccessError("Bu işlem için işletme sahibi veya yönetici yetkisi gerekiyor.", 403);
  if (section === "settings" && !elevated) throw new BusinessAccessError("İşletme ayarları için yetkin yok.", 403);
}
