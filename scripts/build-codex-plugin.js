#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");
const PLUGIN_DIR = path.join(ROOT_DIR, "plugins", "codex", "websculpt");
const DIST_DIR = path.join(ROOT_DIR, "plugins", "codex", "dist");
const CONFIG_PATH = path.join(__dirname, "codex-plugin-config.json");

function log(message) {
  console.log(`[build-codex-plugin] ${message}`);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf-8");
}

function bumpPatchVersion(version) {
  const parts = version.split(".").map(Number);
  parts[2] = (parts[2] ?? 0) + 1;
  return parts.join(".");
}

function resolveVersion(config) {
  if (config.version) {
    return config.version;
  }

  const manifestPath = path.join(PLUGIN_DIR, ".codex-plugin", "plugin.json");
  if (fs.existsSync(manifestPath)) {
    const manifest = readJson(manifestPath);
    return bumpPatchVersion(manifest.version || "0.1.0");
  }

  return "0.1.0";
}

function cleanDirectory(dirPath) {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
  fs.mkdirSync(dirPath, { recursive: true });
}

function copyDirectory(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirectory(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function copySkills(skillSources) {
  log("Copying skills...");
  const skillsDir = path.join(PLUGIN_DIR, "skills");
  cleanDirectory(skillsDir);

  for (const [targetName, sourcePath] of Object.entries(skillSources)) {
    const src = path.resolve(ROOT_DIR, sourcePath);
    const dest = path.join(skillsDir, targetName);
    if (!fs.existsSync(src)) {
      throw new Error(`Skill source not found: ${src}`);
    }
    copyDirectory(src, dest);
    log(`  Copied ${sourcePath} -> skills/${targetName}`);
  }
}

function replaceCommandPrefix(skillsDir) {
  log("Replacing command prefix in SKILL.md files...");
  const skillNames = fs.readdirSync(skillsDir);

  for (const skillName of skillNames) {
    const skillMdPath = path.join(skillsDir, skillName, "SKILL.md");
    if (!fs.existsSync(skillMdPath)) {
      continue;
    }

    const content = fs.readFileSync(skillMdPath, "utf-8");
    const lines = content.split("\n");
    const newLines = lines.map((line) => {
      if (line.match(/^websculpt\s/)) {
        return line.replace(/^websculpt\s/, "npx websculpt ");
      }
      return line;
    });

    const newContent = newLines.join("\n");
    if (newContent !== content) {
      fs.writeFileSync(skillMdPath, newContent, "utf-8");
      log(`  Updated skills/${skillName}/SKILL.md`);
    }
  }
}

function generateManifest(config, version) {
  log(`Generating .codex-plugin/plugin.json (version ${version})...`);

  return {
    name: config.pluginName,
    version,
    description: config.description,
    author: {
      name: "bqw1013",
      url: "https://github.com/bqw1013",
    },
    homepage: config.websiteURL,
    repository: config.websiteURL,
    license: "Apache-2.0",
    keywords: config.keywords,
    skills: "./skills/",
    hooks: "./hooks/hooks.json",
    interface: {
      displayName: config.displayName,
      shortDescription: config.shortDescription,
      longDescription: config.longDescription,
      developerName: "bqw1013",
      category: config.category,
      capabilities: ["Read", "Write"],
      websiteURL: config.websiteURL,
      privacyPolicyURL: config.privacyPolicyURL,
      termsOfServiceURL: config.termsOfServiceURL,
      defaultPrompt: config.defaultPrompts,
      brandColor: "#10A37F",
    },
  };
}

function generateInstallHook(config) {
  log("Generating hooks/install.js...");

  return `import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const nodeMajor = Number.parseInt(process.version.slice(1).split(".")[0], 10);
if (Number.isNaN(nodeMajor) || nodeMajor < 22) {
  console.error(
    \`WebSculpt requires Node.js >= 22, but the current environment is running Node.js \${process.version}.\`
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

const packages = ["websculpt@${config.websculptVersion}", "@playwright/cli@${config.playwrightCliVersion}"];
const result = spawnSync(
  process.platform === "win32" ? "npm.cmd" : "npm",
  ["install", "-g", "--engine-strict", ...packages],
  { stdio: "inherit", shell: false }
);

if (result.status !== 0) {
  console.error(\`Failed to install WebSculpt runtime (exit \${result.status ?? result.signal}).\`);
  process.exit(result.status ?? 1);
}

writeFileSync(markerFile, JSON.stringify({ installedAt: new Date().toISOString() }, null, 2));
console.log("WebSculpt runtime installed successfully.");
`;
}

function copyRootReadme() {
  const rootReadmePath = path.join(ROOT_DIR, "README.md");
  if (!fs.existsSync(rootReadmePath)) {
    log("Warning: project root README.md not found, skipping README copy");
    return;
  }

  log("Copying project README.md into plugin directory...");
  fs.copyFileSync(rootReadmePath, path.join(PLUGIN_DIR, "README.md"));
}

function validatePlugin() {
  log("Validating plugin structure...");

  const manifestPath = path.join(PLUGIN_DIR, ".codex-plugin", "plugin.json");
  if (!fs.existsSync(manifestPath)) {
    throw new Error("Missing plugin manifest: .codex-plugin/plugin.json");
  }
  readJson(manifestPath);

  const skillsDir = path.join(PLUGIN_DIR, "skills");
  if (!fs.existsSync(skillsDir)) {
    throw new Error("Missing skills directory");
  }
  const skillNames = fs.readdirSync(skillsDir);
  if (skillNames.length === 0) {
    throw new Error("No skills found in skills directory");
  }
  for (const skillName of skillNames) {
    const skillMdPath = path.join(skillsDir, skillName, "SKILL.md");
    if (!fs.existsSync(skillMdPath)) {
      throw new Error(`Missing SKILL.md for skill: ${skillName}`);
    }
  }

  const hooksFile = path.join(PLUGIN_DIR, "hooks", "hooks.json");
  if (!fs.existsSync(hooksFile)) {
    throw new Error("Missing hooks/hooks.json");
  }
  readJson(hooksFile);

  const installHook = path.join(PLUGIN_DIR, "hooks", "install.js");
  if (!fs.existsSync(installHook)) {
    throw new Error("Missing hooks/install.js");
  }

  log("Validation passed.");
}

function findPython() {
  for (const candidate of ["python3", "python", "py"]) {
    try {
      execSync(`${candidate} --version`, { stdio: "ignore" });
      return candidate;
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

function packageWithPython(python, outputPath) {
  const scriptPath = path.join(DIST_DIR, "_package.py");
  const script = `import os
import sys
import zipfile

root = sys.argv[1]
output = sys.argv[2]

with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as zf:
    for dirpath, _dirnames, filenames in os.walk(root):
        for filename in filenames:
            filepath = os.path.join(dirpath, filename)
            arcname = os.path.relpath(filepath, root).replace(os.sep, "/")
            zf.write(filepath, arcname)
`;
  fs.writeFileSync(scriptPath, script, "utf-8");
  try {
    execSync(`"${python}" "${scriptPath}" "${PLUGIN_DIR}" "${outputPath}"`, {
      cwd: ROOT_DIR,
      stdio: "inherit",
    });
  } finally {
    fs.unlinkSync(scriptPath);
  }
}

function packageWithPowerShell(outputPath) {
  const sourcePattern = path.join(PLUGIN_DIR, "*");
  execSync(
    `powershell -Command "Compress-Archive -Path '${sourcePattern}' -DestinationPath '${outputPath}' -Force"`,
    { cwd: ROOT_DIR, stdio: "inherit" },
  );
}

function packageWithZip(outputPath) {
  execSync(`zip -r "${outputPath}" .`, {
    cwd: PLUGIN_DIR,
    stdio: "inherit",
  });
}

function packageWithTar(version) {
  log("zip not available, falling back to tar.gz...");
  const tarPath = path.join(DIST_DIR, `websculpt-${version}.tar.gz`);
  execSync(`tar -czf "${tarPath}" .`, {
    cwd: PLUGIN_DIR,
    stdio: "inherit",
  });
  return tarPath;
}

function packagePlugin(version) {
  log("Packaging plugin...");

  cleanDirectory(DIST_DIR);

  const outputName = `websculpt-${version}.zip`;
  const outputPath = path.join(DIST_DIR, outputName);

  const python = findPython();
  if (python) {
    packageWithPython(python, outputPath);
    return outputPath;
  }

  if (process.platform === "win32") {
    packageWithPowerShell(outputPath);
    return outputPath;
  }

  try {
    packageWithZip(outputPath);
    return outputPath;
  } catch {
    return packageWithTar(version);
  }
}

function getGitCommitSha() {
  return execSync("git rev-parse HEAD", {
    cwd: ROOT_DIR,
    encoding: "utf-8",
  }).trim();
}

async function main() {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error(`Config file not found: ${CONFIG_PATH}`);
  }

  const config = readJson(CONFIG_PATH);
  const version = resolveVersion(config);

  copySkills(config.skillSources);
  replaceCommandPrefix(path.join(PLUGIN_DIR, "skills"));

  const manifest = generateManifest(config, version);
  writeJson(path.join(PLUGIN_DIR, ".codex-plugin", "plugin.json"), manifest);

  const installHook = generateInstallHook(config);
  fs.writeFileSync(path.join(PLUGIN_DIR, "hooks", "install.js"), installHook, "utf-8");

  copyRootReadme();
  validatePlugin();

  const packagePath = packagePlugin(version);
  const commitSha = getGitCommitSha();

  log(`Source commit: ${commitSha}`);
  log(`Package: ${packagePath}`);
  log("Build complete.");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
