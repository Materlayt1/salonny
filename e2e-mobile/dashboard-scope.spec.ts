import { expect, test } from "@playwright/test";
import { appointment, appointmentId, business, mockApi, signIn } from "./fixtures";
const headers={"Access-Control-Allow-Origin":"http://localhost:8082","Access-Control-Allow-Headers":"authorization,content-type"};
test("dashboard labels branch counts and opens the complete day when more than eight appointments exist",async({page})=>{
  const writes=await mockApi(page,{businessAccount:true});
  await page.route("http://localhost:3001/api/business-management/dashboard**",route=>{
    if(route.request().method()==="OPTIONS")return route.fulfill({status:204,headers});
    return route.fulfill({headers,json:{date:"2026-10-17",timezone:"Europe/Istanbul",rows:[{id:appointmentId,title:"Test müşteri",subtitle:"Saç kesimi · Uzman",startsAt:appointment.startsAt,status:"confirmed"}],total:1001,hasMore:false,metrics:[{label:"Bugünkü randevular",value:"1001",icon:"calendar"},{label:"Şubedeki aktif hizmetler",value:"4",icon:"scissors"}]}});
  });
  await signIn(page); await page.goto("/manage/dashboard");
  await expect(page.getByText("1001",{exact:true})).toBeVisible();
  await expect(page.getByText("Şubedeki aktif hizmetler",{exact:true})).toBeVisible();
  await expect(page.getByText(/Hizmet\/çalışan sayıları seçili şubeye/)).toBeVisible();
  await page.getByRole("button",{name:"Bugünün tüm randevularını göster",exact:true}).click();
  await expect(page).toHaveURL(/manage\/calendar/); expect(writes).toHaveLength(0);
});
test("a failed dashboard read is not presented as successful zero metrics",async({page})=>{
  await mockApi(page,{businessAccount:true});
  await page.route("http://localhost:3001/api/business-management/dashboard**",route=>route.request().method()==="OPTIONS"?route.fulfill({status:204,headers}):route.fulfill({status:503,headers,json:{error:"Şube özeti şu anda kullanılamıyor."}}));
  await signIn(page); await page.goto("/manage/dashboard");
  await expect(page.getByText("Şube özeti şu anda kullanılamıyor.",{exact:true})).toBeVisible();
  await expect(page.getByText("Şubedeki aktif hizmetler",{exact:true})).toHaveCount(0);
});
test("dashboard branch switches replace the old day's rows without creating records",async({page})=>{
  const writes=await mockApi(page,{businessAccount:true});
  await page.route("http://localhost:3001/api/business-management/dashboard**",route=>{
    if(route.request().method()==="OPTIONS")return route.fulfill({status:204,headers});
    const second=new URL(route.request().url()).searchParams.get("branchId")===appointmentId;
    return route.fulfill({headers,json:{date:"2026-10-17",timezone:"Europe/Istanbul",rows:[{id:appointmentId,title:second?"İkinci şube müşterisi":"İlk şube müşterisi",subtitle:business.services[0].name,startsAt:appointment.startsAt,status:"confirmed"}],total:1,hasMore:false,metrics:[]}});
  });
  await signIn(page); await page.goto("/manage/dashboard");
  await expect(page.getByText("İlk şube müşterisi",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"İşletme menüsünü aç",exact:true}).click(); await page.getByText("İkinci şube",{exact:true}).click();
  await expect(page.getByText("İkinci şube müşterisi",{exact:true})).toBeVisible(); await expect(page.getByText("İlk şube müşterisi",{exact:true})).toHaveCount(0); expect(writes).toHaveLength(0);
});
test("calendar Today uses the selected branch timezone, not Istanbul or the device timezone",async({page})=>{
  await page.clock.install({time:new Date("2026-10-17T01:00:00Z")});
  await mockApi(page,{businessAccount:true});
  await page.route("http://localhost:3001/api/business-management/context**",route=>route.request().method()==="OPTIONS"?route.fulfill({status:204,headers}):route.fulfill({headers,json:{business, businesses:[{id:business.id,name:business.name}],branch:{id:business.branchId,name:"Test NY şubesi",timezone:"America/New_York"},branches:[{id:business.branchId,name:"Test NY şubesi"}],role:"OWNER",permissions:{calendar:true,customers:true,reports:true,campaigns:true,inventory:true,operations:true},financialVisibility:true,customerVisibility:"all",person:"Test yönetici"}}));
  const dates:string[]=[];
  await page.route("http://localhost:3001/api/business-management/calendar**",route=>{
    if(route.request().method()==="OPTIONS")return route.fulfill({status:204,headers});
    dates.push(new URL(route.request().url()).searchParams.get("date")??"");
    return route.fulfill({headers,json:{rows:[],total:0,hasMore:false}});
  });
  await signIn(page); await page.goto("/manage/calendar");
  await expect.poll(()=>dates.at(-1)).toBe("2026-10-16");
  await page.getByRole("button",{name:"Sonraki gün",exact:true}).click();
  await expect.poll(()=>dates.at(-1)).toBe("2026-10-17");
  await page.getByRole("button",{name:"Bugün",exact:true}).click();
  // The first day's fresh query may be reused from the cache; validate the
  // selected screen date rather than requiring a redundant network request.
  await expect(page.getByText("16 Ekim Cum",{exact:true})).toBeVisible();
});
