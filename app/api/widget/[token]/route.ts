import { NextResponse } from "next/server";
import { apiRateLimit } from "@/lib/api-security";

const tokenPattern = /^[a-f0-9]{18}$/;

export async function GET(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const limited = await apiRateLimit(request, "booking-widget", 240, 60_000);
  if (limited) return limited;
  const { token } = await context.params;
  if (!tokenPattern.test(token))
    return new NextResponse("/* invalid Salonny widget */", { status: 422 });
  const origin = new URL(request.url).origin;
  const bookingUrl = `${origin}/r/${token}`;
  const script = `(()=>{if(document.getElementById('salonny-booking-widget'))return;const a=document.createElement('a');a.id='salonny-booking-widget';a.href=${JSON.stringify(bookingUrl)};a.target='_blank';a.rel='noopener noreferrer';a.textContent='Randevu Al';a.setAttribute('aria-label','Salonny üzerinden randevu al');Object.assign(a.style,{position:'fixed',right:'20px',bottom:'20px',zIndex:'2147483647',background:'#6C4BF4',color:'#fff',font:'600 14px system-ui,sans-serif',padding:'13px 18px',borderRadius:'999px',boxShadow:'0 8px 30px rgba(37,27,89,.24)',textDecoration:'none'});document.body.appendChild(a)})();`;
  return new NextResponse(script, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      "Access-Control-Allow-Origin": "*",
      "Cross-Origin-Resource-Policy": "cross-origin",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
