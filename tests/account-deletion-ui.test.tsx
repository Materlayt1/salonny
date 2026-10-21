import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DeleteAccountForm } from "@/components/delete-account-form";
import { BusinessUnavailable } from "@/components/business-unavailable";
import { BusinessReadError } from "@/components/business-read-error";
describe("web deletion and unavailable listing UI",()=>{
  it("cannot submit an unhydrated deletion request or leak email through a GET URL",()=>{
    const html=renderToStaticMarkup(createElement(DeleteAccountForm,{email:"fixture@example.com"}));
    expect(html).toContain('method="post"');expect(html).toContain('<fieldset disabled=""');expect(html).not.toContain('name="user_id"');
  });
  it("distinguishes a withdrawn business from a temporary service failure",()=>{
    const gone=renderToStaticMarkup(createElement(BusinessUnavailable));const error=renderToStaticMarkup(createElement(BusinessReadError,{retry:()=>{}}));
    expect(gone).toContain("İşletme şu anda yayında değil");expect(gone).toContain('href="/kesfet"');expect(gone).not.toContain("Yeniden dene");
    expect(error).toContain("işletmenin silindiği anlamına gelmez");expect(error).toContain("Yeniden dene");
  });
});
