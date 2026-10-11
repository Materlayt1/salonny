import { createContext, useContext, useState, type PropsWithChildren } from "react";
import { useQuery } from "@tanstack/react-query";
import { getPanelContext, type PanelScope } from "@/lib/management";
import { useAuth } from "@/providers/auth-provider";

function useManagementState() {
  const { session, user } = useAuth();
  const [selection, setSelection] = useState<PanelScope>({});
  const context = useQuery({ queryKey: ["business-panel", "context", user?.id, selection], queryFn: () => getPanelContext(session!.access_token, selection), enabled: Boolean(session?.access_token), retry: false, placeholderData: (previous) => previous });
  const scope = { businessId: context.data?.business.id, branchId: context.data?.branch.id };
  const setBranchId = (branchId: string) => setSelection({ businessId: context.data?.business.id, branchId });
  const setBusinessId = (businessId: string) => setSelection({ businessId });
  return { context, scope, setBranchId, setBusinessId, session, user };
}
const ManagementContext = createContext<ReturnType<typeof useManagementState> | null>(null);
export function ManagementProvider({ children }: PropsWithChildren) { return <ManagementContext.Provider value={useManagementState()}>{children}</ManagementContext.Provider>; }
export function useManagement() { const state = useContext(ManagementContext); if (!state) throw new Error("ManagementProvider gerekli"); return state; }
