import { spawn } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const directory = resolve(root, "apps/mobile");
const output = resolve(root, "public/mobile");
const marker = resolve(output, ".salonny-generated-preview");
const markerValue = "Salonny generated Expo browser preview\n";

// Expo can replace its output directory. Refuse to overwrite non-generated
// files; never clean the public directory, the local dist preview, or artifacts.
try {
  const entries = await readdir(output);
  if (entries.length && await readFile(marker, "utf8").catch(() => "") !== markerValue) {
    throw new Error("public/mobile contains files not owned by the preview exporter.");
  }
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
await mkdir(output, { recursive: true });
await writeFile(marker, markerValue);

const require = createRequire(resolve(directory, "package.json"));
const env = {
  ...process.env,
  SALONNY_HOSTED_MOBILE_PREVIEW: "1",
  EXPO_PUBLIC_API_SAME_ORIGIN: "1",
  EXPO_PUBLIC_API_URL: "",
  // Use the existing public-config endpoint. Do not bake local project settings
  // into a hosted bundle; no service-role or Redis keys are ever forwarded.
  EXPO_PUBLIC_SUPABASE_URL: "",
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
  EXPO_PUBLIC_SUPABASE_ANON_KEY: "",
  EXPO_NO_DOTENV: "1",
};
const child = spawn(process.execPath, [require.resolve("expo/bin/cli"), "export", "--platform", "web", "--clear", "--output-dir", output], {
  cwd: directory, stdio: "inherit", env,
});
child.on("error", (error) => { console.error(error.message); process.exitCode = 1; });
child.on("exit", async (code) => {
  try {
    // Also mark a partial failed export so a subsequent build can retry safely.
    await writeFile(marker, markerValue);
    if (code !== 0) { process.exitCode = code ?? 1; return; }
    await readFile(resolve(output, "index.html"));
    console.log("Hosted mobile preview exported at /mobile (same-origin API).");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
});
