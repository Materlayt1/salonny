import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { resolve } from "node:path";
const directory = resolve("apps/mobile");
const require = createRequire(resolve(directory, "package.json"));
// Inject local API only into preview export, never into release build settings.
const child = spawn(process.execPath, [require.resolve("expo/bin/cli"), "export", "--platform", "web", "--clear"], {
  cwd: directory, stdio: "inherit", env: { ...process.env, EXPO_PUBLIC_API_URL: "http://localhost:3001" },
});
child.on("exit", (code) => process.exit(code ?? 1));
child.on("error", (error) => { console.error(error.message); process.exit(1); });
