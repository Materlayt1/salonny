import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DashboardShell } from "@/components/dashboard-shell";
vi.mock("next/navigation",()=>({usePathname:()=>"/business/inventory"}));
vi.mock("@/app/business/actions",()=>({selectBusinessBranch:vi.fn()}));
vi.mock("@/components/notification-bell-link",()=>({NotificationBellLink:()=>null}));
describe("web business menu accessibility",()=>{
  it("names the mobile menu opener and provides a 44px target without shrinking it in a narrow header",()=>{
    const html=renderToStaticMarkup(<DashboardShell business={{name:"Salon",slug:"salon",branch:"Merkez",branchId:"branch",branches:[],role:"OWNER",person:"Yönetici"}}>Panel</DashboardShell>);
    expect(html).toContain('aria-label="İşletme menüsünü aç"');expect(html).toContain('aria-label="İşletme menüsünü kapat"');expect(html).toContain('aria-expanded="false"');expect(html).toContain("h-11 w-11 shrink-0");
  });
});
