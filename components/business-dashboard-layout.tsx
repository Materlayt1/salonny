import { DashboardShell } from "@/components/dashboard-shell";
import { requireBusinessContext } from "@/lib/business-context";

export async function BusinessDashboardLayout({ children }: { children: React.ReactNode }) {
  const context = await requireBusinessContext(["OWNER", "MANAGER", "EMPLOYEE"]);
  return <DashboardShell business={{ name: context.business.name, slug: context.business.slug, branch: context.branch.name, role: context.role, person: context.user.fullName ?? context.user.email?.split("@")[0] ?? "Hesabım" }}>{children}</DashboardShell>;
}
