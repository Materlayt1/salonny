import { requestJson } from "@/lib/api";

export type PanelSection = "dashboard" | "calendar" | "appointments" | "operations" | "customers" | "services" | "employees" | "reports" | "inventory" | "campaigns" | "settings";
export const panelSections: { key: PanelSection; label: string; description: string }[] = [
  { key: "dashboard", label: "Özet", description: "İşletmenin günlük görünümü" },
  { key: "calendar", label: "Takvim", description: "Günün randevu akışı" },
  { key: "appointments", label: "Randevular", description: "Randevularını takip et ve yönet" },
  { key: "operations", label: "Operasyonlar", description: "Bekleme listesi ve şube kaynakları" },
  { key: "customers", label: "Müşteriler", description: "Müşteri bilgileri ve notlar" },
  { key: "services", label: "Hizmetler", description: "Hizmetler, süreler ve fiyatlar" },
  { key: "employees", label: "Çalışanlar", description: "Ekibini yönet" },
  { key: "reports", label: "Raporlar", description: "Randevu kayıtları ve tutarları" },
  { key: "inventory", label: "Stok", description: "Ürünler ve stok hareketleri" },
  { key: "campaigns", label: "Pazarlama", description: "Kampanyalarının durumunu yönet" },
  { key: "settings", label: "Ayarlar", description: "Randevu ve bekleme listesi ayarları" },
];
export type PanelContext = {
  business: { id: string; name: string; slug: string; status: string };
  businesses: { id: string; name: string }[];
  branch: { id: string; name: string };
  branches: { id: string; name: string }[];
  role: "OWNER" | "MANAGER" | "EMPLOYEE";
  permissions: Record<string, boolean>;
  financialVisibility: boolean;
  customerVisibility: "all" | "assigned" | "none";
  person: string;
};
export type PanelRow = {
  id: string; title: string; subtitle?: string; status?: string; active?: boolean;
  startsAt?: string; endsAt?: string; amountMinor?: number; currency?: string;
  phone?: string; email?: string; notes?: string; description?: string; roleTitle?: string; bio?: string;
  duration_minutes?: number; price_minor?: number; stock_quantity?: number; minimum_stock?: number;
  sku?: string; purchase_price_minor?: number; sale_price_minor?: number; kind?: string;
};
export type PanelSettings = { booking_window_days: number; minimum_notice_minutes: number; cancellation_notice_minutes: number; auto_confirm: boolean; allow_waitlist: boolean };
export type PanelPage = { rows: PanelRow[]; total?: number; hasMore?: boolean; metrics?: { label: string; value: string; icon: string }[]; settings?: PanelSettings };
export type PanelScope = { businessId?: string; branchId?: string };
function path(section: string, params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => { if (value !== undefined && value !== "") search.set(key, String(value)); });
  return `/api/business-management/${section}?${search}`;
}
export const getPanelContext = (token: string, scope: PanelScope) => requestJson<PanelContext>(path("context", scope), {}, token);
export const getPanelPage = (section: PanelSection, token: string, scope: PanelScope, filters: { date?: string; q?: string; offset?: number; status?: string }) => requestJson<PanelPage>(path(section, { ...scope, ...filters }), {}, token);
export const savePanelRecord = (section: PanelSection, token: string, scope: PanelScope, values: Record<string, unknown>) => requestJson<{ saved: boolean }>(path(section, scope), { method: "POST", body: JSON.stringify(values) }, token);
export type TeamPeriod = { weekday: number; startsAt: string; endsAt: string };
export type TeamTimeOff = { id: string; startsAt: string; endsAt: string; kind: "leave" | "vacation" | "blocked" | "break"; note: string };
export type TeamPage = { employee: { id: string; name: string }; services: { id: string; name: string; active: boolean; assigned: boolean }[]; periods: TeamPeriod[]; hasAdvancedSchedule: boolean; timeOff: TeamTimeOff[]; hasMore: boolean };
export const getTeamPage = (token: string, scope: PanelScope, employeeId: string, offset: number, signal?: AbortSignal) => requestJson<TeamPage>(path("team", { ...scope, employeeId, offset }), { signal }, token);
export const saveTeam = (token: string, scope: PanelScope, employeeId: string, values: Record<string, unknown>) => requestJson<{ saved: boolean }>(path("team", scope), { method: "POST", body: JSON.stringify({ ...values, employeeId }) }, token);
export function canViewSection(context: PanelContext, section: PanelSection) {
  const permission: Partial<Record<PanelSection, string>> = { calendar: "calendar", appointments: "calendar", customers: "customers", operations: "operations", reports: "reports", inventory: "inventory", campaigns: "campaigns" };
  if (section === "settings") return context.role !== "EMPLOYEE";
  if (section === "customers" && context.customerVisibility === "none") return false;
  if (section === "reports" && !context.financialVisibility) return false;
  return !permission[section] || context.permissions[permission[section]!] === true;
}
