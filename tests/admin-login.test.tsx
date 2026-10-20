import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminLoginPage from "@/app/admin/login/page";
import { AdminLoginForm } from "@/components/admin-login-form";
import { createServerClientOptional } from "@/lib/supabase/server";
vi.mock("@/lib/supabase/server", () => ({ createServerClientOptional: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error("REDIRECT:" + url); }, useRouter: () => ({replace: vi.fn(), refresh: vi.fn()}) }));
vi.mock("next/image", () => ({ default: () => createElement("img", {alt:"",src:"/brand/salonny-mark.png"}) }));
vi.mock("next/link", () => ({ default: ({children,href}: {children:React.ReactNode;href:string}) => createElement("a",{href},children) }));
const maybeSingle = vi.fn();
beforeEach(() => {
  maybeSingle.mockResolvedValue({data:{role:"ADMIN",deleted_at:null},error:null});
  vi.mocked(createServerClientOptional).mockResolvedValue({auth:{getUser:async()=>({data:{user:{id:"admin-id"}},error:null})},from:()=>({select:()=>({eq:()=>({maybeSingle})})})} as never);
});
describe("admin sign-in safeguards",()=>{
  it("redirects only a live ADMIN, never loops a deleted account back to protected admin",async()=>{
    await expect(AdminLoginPage()).rejects.toThrow("REDIRECT:/admin");
    maybeSingle.mockResolvedValue({data:{role:"ADMIN",deleted_at:"2026-10-20"},error:null});
    const html=renderToStaticMarkup(await AdminLoginPage());expect(html).toContain("Salonny Admin");
  });
  it("does not redirect on a failed profile read",async()=>{
    maybeSingle.mockResolvedValue({data:null,error:{message:"PRIVATE SQL"}});
    const html=renderToStaticMarkup(await AdminLoginPage());expect(html).toContain("Salonny Admin");expect(html).not.toContain("PRIVATE SQL");
  });
  it("cannot send credentials in a GET URL or accept unhydrated input",()=>{
    const html=renderToStaticMarkup(createElement(AdminLoginForm));expect(html).toContain('method="post"');expect(html).toContain('<fieldset disabled=""');expect(html).toContain("JavaScript gerekir");
  });
});
