// Local-only preview of Expo's production web export. Not a deployment server.
import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { resolve, extname, sep } from "node:path";
import { dynamicPreviewDocument } from "./mobile-preview-routing.mjs";
const root = resolve("apps/mobile/dist");
const port = Number(process.env.MOBILE_PREVIEW_PORT ?? 8082);
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".svg": "image/svg+xml", ".ttf": "font/ttf", ".woff2": "font/woff2", ".ico": "image/x-icon" };
createServer((request, response) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname); }
  catch { response.writeHead(400).end(); return; }
  if (!["GET", "HEAD"].includes(request.method)) { response.writeHead(405).end(); return; }
  const target = resolve(root, `.${pathname}`);
  if (target !== root && !target.startsWith(root + sep)) { response.writeHead(403).end(); return; }
  const file = [target, `${target}.html`, resolve(target, "index.html")].find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
  const dynamicDocument = dynamicPreviewDocument(pathname);
  const selected = file ?? (dynamicDocument ? resolve(root, dynamicDocument) : null);
  if (!selected || !existsSync(selected)) { response.writeHead(404, { "Content-Type": "text/plain" }).end("Not found"); return; }
  response.writeHead(200, { "Content-Type": types[extname(selected)] ?? "application/octet-stream", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  if (request.method === "HEAD") response.end(); else createReadStream(selected).pipe(response);
}).listen(port, "127.0.0.1", () => console.log(`Salonny mobile preview: http://localhost:${port}`));
