import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const nodeMajor = Number.parseInt(process.version.slice(1).split(".")[0], 10);
if (Number.isNaN(nodeMajor) || nodeMajor < 22) {
  console.error(
    `WebSculpt requires Node.js >= 22, but the current environment is running Node.js ${process.version}.`
  );
  process.exit(1);
}

const pluginData = process.env.PLUGIN_DATA || process.env.CLAUDE_PLUGIN_DATA;
if (!pluginData) {
  console.error("PLUGIN_DATA is not set; skipping WebSculpt installation.");
  process.exit(0);
}

const markerDir = pluginData;
const markerFile = join(markerDir, ".installed");

if (existsSync(markerFile)) {
  console.log("WebSculpt runtime already installed.");
  process.exit(0);
}

mkdirSync(markerDir, { recursive: true });

const packages = ["websculpt@^0.3.10", "@playwright/cli@0.1.13"];
const result = spawnSync(
  process.platform === "win32" ? "npm.cmd" : "npm",
  ["install", "-g", "--engine-strict", ...packages],
  { stdio: "inherit", shell: false }
);

if (result.status !== 0) {
  console.error(`Failed to install WebSculpt runtime (exit ${result.status ?? result.signal}).`);
  process.exit(result.status ?? 1);
}

writeFileSync(markerFile, JSON.stringify({ installedAt: new Date().toISOString() }, null, 2));
console.log("WebSculpt runtime installed successfully.");
