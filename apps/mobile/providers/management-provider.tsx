import { createContext, useContext, useState, type PropsWithChildren } from "react";
import { useQuery } from "@tanstack/react-query";
import { getPanelContext, type PanelScope } from "@/lib/management";
import { useAuth } from "@/providers/auth-provider";
import { useLocalSearchParams } from "expo-router";

function useManagementState() {
  const { session, user } = useAuth();
  const params = useLocalSearchParams<{ businessId?: string; branchId?: string }>();
  const [selection, setSelection] = useState<PanelScope>(() => ({ ...(params.businessId ? { businessId: params.businessId } : {}), ...(params.branchId ? { branchId: params.branchId } : {}) }));
  const [actorId, setActorId] = useState(user?.id);
  if (actorId !== user?.id) {
    setActorId(user?.id);
    setSelection({ ...(params.businessId ? { businessId: params.businessId } : {}), ...(params.branchId ? { branchId: params.branchId } : {}) });
  }
  const entryScope = `${params.businessId ?? ""}/${params.branchId ?? ""}`;
  const [lastEntryScope, setLastEntryScope] = useState(entryScope);
  if (entryScope !== lastEntryScope) {
    setLastEntryScope(entryScope);
    if (params.businessId) setSelection({ businessId: params.businessId, ...(params.branchId ? { branchId: params.branchId } : {}) });
  }
  const context = useQuery({ queryKey: ["business-panel", "context", user?.id, session?.access_token, selection], queryFn: ({ signal }) => getPanelContext(session!.access_token, selection, signal), enabled: Boolean(session?.access_token), retry: false });
  const scope = { businessId: context.data?.business.id, branchId: context.data?.branch.id };
  const setBranchId = (branchId: string) => setSelection({ businessId: context.data?.business.id, branchId });
  const setBusinessId = (businessId: string) => setSelection({ businessId });
  return { context, scope, setBranchId, setBusinessId, session, user };
}
const ManagementContext = createContext<ReturnType<typeof useManagementState> | null>(null);
export function ManagementProvider({ children }: PropsWithChildren) { return <ManagementContext.Provider value={useManagementState()}>{children}</ManagementContext.Provider>; }
export function useManagement() { const state = useContext(ManagementContext); if (!state) throw new Error("ManagementProvider gerekli"); return state; }
