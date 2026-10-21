/* eslint-disable @typescript-eslint/no-require-imports */
const { chromium } = require("@playwright/test");
const fs = require("node:fs/promises");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const OUTPUT_DIR = path.join(ROOT, "artifacts", "customer-pages");
const BASE_URL = "http://127.0.0.1:3001";

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function main() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    colorScheme: "light",
    locale: "tr-TR",
  });
  const lookupPage = await context.newPage();
  const businessPayload = await lookupPage
    .request
    .get(`${BASE_URL}/api/businesses?limit=1`)
    .then((response) => response.json());
  const business = businessPayload.businesses?.[0];
  if (!business) throw new Error("Yayınlanmış işletme bulunamadı.");
  await lookupPage.close();

  const screens = [
    { group: "Keşif", title: "Ana sayfa", route: "/", note: "Vitrinler ve kategoriler" },
    { group: "Keşif", title: "Keşfet", route: "/kesfet", note: "Harita ve sonuç paneli" },
    { group: "Keşif", title: "İşletme detayı", route: `/business/${business.slug}`, note: "Galeri, hizmet ve yorumlar" },
    { group: "Randevu", title: "Randevu oluştur", route: `/booking/${business.slug}`, note: "Hizmetten onaya akış" },
    { group: "Randevu", title: "Randevularım", route: "/appointments", note: "Yaklaşan ve geçmiş kayıtlar" },
    { group: "Randevu", title: "Bildirimler", route: "/notifications", note: "Müşteri bildirim merkezi" },
    { group: "Hesap", title: "Giriş", route: "/auth/login", note: "E-posta ile güvenli giriş" },
    { group: "Hesap", title: "Üyelik", route: "/auth/login?mode=signup", note: "Yeni müşteri hesabı" },
    { group: "Hesap", title: "E-posta doğrulama", route: "/auth/verify", note: "Doğrulama bekleme ekranı" },
    { group: "Hesap", title: "Profil", route: "/profile", note: "Giriş güvenlik kapısı" },
    { group: "Hesap", title: "Favoriler", route: "/favorites", note: "Giriş güvenlik kapısı" },
    { group: "Ayarlar", title: "Kişisel bilgiler", route: "/profile/personal", note: "Profil formu" },
    { group: "Ayarlar", title: "Adresler", route: "/profile/addresses", note: "Kayıtlı adres yönetimi" },
    { group: "Ayarlar", title: "Bildirim ayarları", route: "/profile/notifications", note: "Kanal tercihleri" },
    { group: "Ayarlar", title: "Güvenlik", route: "/profile/security", note: "Şifre ve oturum güvenliği" },
    { group: "Destek", title: "Yardım ve destek", route: "/profile/help", note: "SSS ve destek talebi" },
    { group: "Destek", title: "Hesap silme", route: "/delete-account", note: "Giriş güvenlik kapısı" },
  ];

  for (let index = 0; index < screens.length; index += 1) {
    const screen = screens[index];
    const page = await context.newPage();
    await page.goto(`${BASE_URL}${screen.route}`, {
      waitUntil: "domcontentloaded",
      timeout: 20_000,
    });
    await page.waitForTimeout(screen.route === "/kesfet" ? 1_500 : 650);
    await page.addStyleTag({
      content: `
        #next-logo, nextjs-portal { display: none !important; }
        * { caret-color: transparent !important; }
      `,
    }).catch(() => undefined);
    const fileName = `${String(index + 1).padStart(2, "0")}-${screen.title
      .toLocaleLowerCase("tr-TR")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")}.png`;
    await page.screenshot({
      path: path.join(OUTPUT_DIR, fileName),
      fullPage: false,
    });
    screen.fileName = fileName;
    screen.actualUrl = new URL(page.url()).pathname + new URL(page.url()).search;
    await page.close();
  }

  const cards = screens
    .map(
      (screen, index) => `
        <article class="screen-card">
          <div class="card-heading">
            <span class="number">${String(index + 1).padStart(2, "0")}</span>
            <div>
              <span class="group">${escapeHtml(screen.group)}</span>
              <h2>${escapeHtml(screen.title)}</h2>
            </div>
          </div>
          <div class="phone">
            <div class="speaker"></div>
            <img src="${escapeHtml(screen.fileName)}" alt="${escapeHtml(screen.title)}" />
          </div>
          <p>${escapeHtml(screen.note)}</p>
          <code>${escapeHtml(screen.route)}</code>
          ${screen.actualUrl !== screen.route ? `<span class="redirect">→ ${escapeHtml(screen.actualUrl)}</span>` : ""}
        </article>`,
    )
    .join("");

  const html = `<!doctype html>
  <html lang="tr">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Salonny müşteri ekranları</title>
      <style>
        * { box-sizing: border-box; }
        body { margin: 0; background: #eeebf8; color: #201a33; font-family: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
        .board { width: 2200px; padding: 80px; background: radial-gradient(circle at 86% 2%, #dcd3ff 0, transparent 26%), linear-gradient(180deg, #f9f7ff 0%, #eeebf8 100%); }
        .hero { display: flex; align-items: flex-end; justify-content: space-between; margin-bottom: 54px; padding: 52px 58px; border-radius: 38px; background: linear-gradient(135deg, #5b3be7, #7d5cff); color: white; box-shadow: 0 24px 70px rgba(66, 42, 153, .22); }
        .eyebrow { display: block; margin-bottom: 18px; font-size: 22px; font-weight: 750; letter-spacing: .13em; text-transform: uppercase; opacity: .72; }
        h1 { margin: 0; font-size: 66px; line-height: .98; letter-spacing: -.055em; }
        .hero p { width: 660px; margin: 0; font-size: 24px; line-height: 1.45; color: rgba(255,255,255,.82); }
        .legend { display: flex; gap: 14px; margin: 0 0 36px; }
        .legend span { padding: 12px 18px; border: 1px solid #d9d1f3; border-radius: 999px; background: rgba(255,255,255,.76); font-size: 18px; font-weight: 700; color: #5b3be7; }
        .grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 26px; align-items: start; }
        .screen-card { min-width: 0; padding: 20px; border: 1px solid rgba(96, 73, 174, .14); border-radius: 28px; background: rgba(255,255,255,.92); box-shadow: 0 16px 42px rgba(43, 29, 94, .09); }
        .card-heading { display: flex; align-items: center; gap: 14px; min-height: 72px; }
        .number { display: grid; width: 46px; height: 46px; flex: 0 0 auto; place-items: center; border-radius: 15px; background: #6c4bf4; color: white; font-size: 17px; font-weight: 800; }
        .group { display: block; font-size: 12px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; color: #8a78dd; }
        h2 { margin: 5px 0 0; font-size: 22px; letter-spacing: -.025em; }
        .phone { position: relative; overflow: hidden; margin-top: 15px; aspect-ratio: 390 / 844; border: 8px solid #211b32; border-radius: 30px; background: white; box-shadow: 0 14px 30px rgba(23, 16, 53, .18); }
        .phone img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: top; }
        .speaker { position: absolute; z-index: 2; top: 8px; left: 50%; width: 66px; height: 16px; border-radius: 999px; background: #211b32; transform: translateX(-50%); }
        .screen-card p { margin: 17px 2px 9px; min-height: 42px; font-size: 16px; line-height: 1.35; color: #625d70; }
        code { display: block; overflow: hidden; padding: 10px 12px; border-radius: 10px; background: #f1edff; color: #6548d1; font: 600 13px/1.2 ui-monospace, SFMono-Regular, Consolas, monospace; text-overflow: ellipsis; white-space: nowrap; }
        .redirect { display: block; overflow: hidden; margin-top: 7px; color: #b35c22; font-size: 12px; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
        .footer { margin-top: 44px; padding: 28px 34px; border: 1px solid #d9d1f3; border-radius: 24px; background: rgba(255,255,255,.7); color: #6b6578; font-size: 17px; line-height: 1.5; }
        .footer strong { color: #342b52; }
      </style>
    </head>
    <body>
      <main class="board">
        <section class="hero">
          <div><span class="eyebrow">Salonny ürün haritası</span><h1>Müşteri ekranları<br/>tek bakışta</h1></div>
          <p>Canlı uygulamanın mobil görünümünden oluşturulan ekran şeması. Akış keşiften randevuya, hesaptan desteğe doğru ilerler.</p>
        </section>
        <div class="legend"><span>Keşif</span><span>Randevu</span><span>Hesap</span><span>Ayarlar</span><span>Destek</span></div>
        <section class="grid">${cards}</section>
        <div class="footer"><strong>Not:</strong> Kilitli müşteri alanlarında ekran, giriş yapılmamış ziyaretçinin gördüğü gerçek güvenlik yönlendirmesini gösterir. Ödeme ekranları mevcut kapsam dışında bırakılmıştır.</div>
      </main>
    </body>
  </html>`;

  const boardHtml = path.join(OUTPUT_DIR, "salonny-customer-pages-board.html");
  const boardPng = path.join(OUTPUT_DIR, "salonny-customer-pages-board.png");
  await fs.writeFile(boardHtml, html, "utf8");

  const boardPage = await context.newPage();
  await boardPage.setViewportSize({ width: 2200, height: 1600 });
  await boardPage.goto(`file:///${boardHtml.replaceAll("\\", "/")}`, {
    waitUntil: "load",
  });
  await boardPage.screenshot({ path: boardPng, fullPage: true });
  await boardPage.close();
  await browser.close();
  console.log(boardPng);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
