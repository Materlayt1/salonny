// Small read-only deployment acceptance, NOT load testing or real account erasure.
const base = (process.env.LIFECYCLE_PREVIEW_URL ?? "https://salonny-preview.netlify.app").replace(/\/$/, "");
const checks = [];
const assert = (name, value) => { if (!value) throw new Error(name); checks.push({ name, result: "PASS" }); };
const read = async (path) => {
  const response = await fetch(base + path, { signal: AbortSignal.timeout(25_000), redirect: "follow" });
  return { response, body: await response.text() };
};
try {
  for (const path of ["/api/businesses?limit=12", "/api/businesses?city=Izmir&limit=12", "/api/home-highlights"]) {
    const { response, body } = await read(path);
    assert(`current public JSON, never CDN stale replay: ${path}`, response.status === 200 && response.headers.get("cache-control")?.includes("no-store") && body.startsWith("{"));
  }
  const positive = await read("/api/businesses/gogo-6f9371");
  assert("existing publication remains readable", positive.response.status === 200 && JSON.parse(positive.body).business.slug === "gogo-6f9371");
  assert("detail responses cannot be CDN replayed", positive.response.headers.get("cache-control")?.includes("no-store"));
  const missing = "unavailable-lifecycle-qa-426491";
  const absent = await read(`/api/businesses/${missing}`);
  assert("actual missing record is explicit no-store 404", absent.response.status === 404 && JSON.parse(absent.body).code === "business_unavailable" && absent.response.headers.get("cache-control")?.includes("no-store"));
  for (const path of [`/business/${missing}`, `/izmir/bornova/kuafor/${missing}`, `/booking/${missing}`]) {
    const { response, body } = await read(path);
    // Next may stream notFound with HTTP 200; JSON API above must be actual 404.
    assert(`web/SEO/booking unavailable exit: ${path}`, [200, 404].includes(response.status) && body.includes("İşletme şu anda yayında değil") && body.includes("İşletmeleri keşfet"));
  }
  const native = await read("/mobile/");
  const entry = native.body.match(/src="([^"]*\/entry-[^"]+\.js)"/u)?.[1];
  assert("hosted native preview exported", native.response.status === 200 && entry?.startsWith("/mobile/"));
  const bundle = await read(entry);
  assert("native bundle has JavaScript MIME", bundle.response.status === 200 && /javascript/.test(bundle.response.headers.get("content-type") ?? ""));
  // Decode literal escapes for inspection only; never execute downloaded JS.
  const bundleText = bundle.body.replace(/\\u([\da-f]{4})|\\x([\da-f]{2})/gi, (_match, unicode, hex) => String.fromCharCode(Number.parseInt(unicode ?? hex, 16)));
  assert("native has withdrawn business and verified receipt handling", bundleText.includes("İşletme şu anda yayında değil") && bundleText.includes("Talebin sonucu doğrulanamadı"));
  const asset = await read("/mobile/_expo/static/js/web/missing-lifecycle-check.js");
  assert("missing JS is not rewritten into HTML success", asset.response.status === 404);
  const csrf = await fetch(base + "/api/customer-profile", { method: "DELETE", headers: { "content-type": "application/json", origin: "https://invalid-origin.example" }, body: JSON.stringify({ confirmed: true }), signal: AbortSignal.timeout(15_000) });
  assert("cross-origin deletion denied before any DB write", csrf.status === 403 && csrf.headers.get("cache-control")?.includes("no-store"));
  const ready = await read("/api/health/ready");
  assert("database and critical limiter readiness", ready.response.status === 200 && JSON.parse(ready.body).status === "ready");
  console.log(JSON.stringify({ base, checks }, null, 2));
} catch (error) { console.error(JSON.stringify({ error: error.message, passed: checks }, null, 2)); process.exitCode = 1; }
