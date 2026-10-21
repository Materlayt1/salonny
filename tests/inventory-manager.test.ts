import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { BusinessInventoryManager } from "@/components/business-inventory-manager";
vi.mock("next/navigation",()=>({useRouter:()=>({refresh:vi.fn()})}));
describe("web stock summary",()=>{
  it("labels loaded page metrics explicitly and retains cents rather than inventing global totals",()=>{
    const html=renderToStaticMarkup(createElement(BusinessInventoryManager,{scope:{businessId:"10000000-0000-4000-8000-000000000001",branchId:"10000000-0000-4000-8000-000000000002"},initialProducts:[{id:"product",name:"Ürün",sku:"P1",stockQuantity:1,minimumStock:2,purchasePrice:123.45,salePrice:543.21,active:true}]}));
    expect(html).toContain("Bu sayfadaki ürün");expect(html).toContain("Bu sayfanın yaklaşık alış değeri");expect(html).not.toContain("Toplam ürün");expect(html).not.toContain("gerçek zamanlı");expect(html).toContain("123,45");expect(html).toContain("543,21");expect(html).not.toContain("SKU ara");
  });
});
