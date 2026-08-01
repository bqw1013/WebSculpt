#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");
const PLUGIN_DIR = path.join(ROOT_DIR, "plugins", "openclaw");
const CONFIG_PATH = path.join(__dirname, "openclaw-plugin-config.json");

// Fixed metadata for the OpenClaw plugin.
const PLUGIN_ID = "websculpt-plugin";
const PLUGIN_NAME = "WebSculpt";
const PLUGIN_DESCRIPTION =
  "Self-evolving browser automation command library for OpenClaw";
const DISPLAY_DESCRIPTION =
  "OpenClaw plugin for WebSculpt. Installs the WebSculpt CLI, @playwright/cli, and four lifecycle skills (explore, capture, maintain, library).";
const PLUGIN_NPM_NAME = "@bqw1013/websculpt-plugin";
const SOURCE_REPO = "https://github.com/bqw1013/WebSculpt.git";
const WEBSCULPT_VERSION = "^0.3.10";
const PLAYWRIGHT_CLI_VERSION = "0.1.13";
const OPENCLAW_PLUGIN_API = ">=2026.3.24-beta.2";
const OPENCLAW_VERSION = "2026.3.24-beta.2";

function log(message) {
  console.log(`[build-openclaw-plugin] ${message}`);
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

function getLatestClawHubVersion(name) {
  try {
    const output = execSync(`clawhub package inspect ${name} --json`, {
      cwd: ROOT_DIR,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "ignore"],
      timeout: 15000,
    });
    const data = JSON.parse(output);
    return data.package?.latestVersion || null;
  } catch {
    return null;
  }
}

function resolveVersion(config) {
  if (config.version) {
    return config.version;
  }

  // Prefer the latest version published on ClawHub so we never re-publish
  // an existing version after a manual/web upload.
  const latestPublished = getLatestClawHubVersion(PLUGIN_NPM_NAME);
  if (latestPublished) {
    return bumpPatchVersion(latestPublished);
  }

  const existingPackagePath = path.join(PLUGIN_DIR, "package.json");
  if (fs.existsSync(existingPackagePath)) {
    const existing = readJson(existingPackagePath);
    return bumpPatchVersion(existing.version || "0.0.0");
  }

  return "0.0.1";
}

function cleanPluginDirectory() {
  log("Cleaning plugin directory...");

  const skillsDir = path.join(PLUGIN_DIR, "skills");
  if (fs.existsSync(skillsDir)) {
    fs.rmSync(skillsDir, { recursive: true, force: true });
  }
  fs.mkdirSync(skillsDir, { recursive: true });

  const reportsDir = path.join(PLUGIN_DIR, "reports");
  if (fs.existsSync(reportsDir)) {
    fs.rmSync(reportsDir, { recursive: true, force: true });
  }

  for (const file of fs.readdirSync(PLUGIN_DIR)) {
    if (file.endsWith(".tgz")) {
      fs.unlinkSync(path.join(PLUGIN_DIR, file));
    }
  }

  // The published README is copied from the project root before packing.
  // Any stale generated README is removed here so we do not accidentally
  // ship an outdated copy.
  const generatedReadmePath = path.join(PLUGIN_DIR, "README.md");
  if (fs.existsSync(generatedReadmePath)) {
    fs.unlinkSync(generatedReadmePath);
  }
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
  for (const [targetName, sourcePath] of Object.entries(skillSources)) {
    const src = path.resolve(ROOT_DIR, sourcePath);
    const dest = path.join(PLUGIN_DIR, "skills", targetName);
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

function generatePackageJson(config, version) {
  log(`Generating package.json (version ${version})...`);

  const dependencies = {
    websculpt: WEBSCULPT_VERSION,
  };

  if (config.includePlaywrightCli) {
    dependencies["@playwright/cli"] = PLAYWRIGHT_CLI_VERSION;
  }

  return {
    name: PLUGIN_NPM_NAME,
    version,
    description: DISPLAY_DESCRIPTION,
    type: "module",
    keywords: config.keywords,
    dependencies,
    openclaw: {
      extensions: ["./src/index.js"],
      runtimeExtensions: ["./src/index.js"],
      compat: {
        pluginApi: OPENCLAW_PLUGIN_API,
      },
      build: {
        openclawVersion: OPENCLAW_VERSION,
      },
    },
  };
}

function generateManifest(version) {
  log(`Generating openclaw.plugin.json (version ${version})...`);

  return {
    id: PLUGIN_ID,
    name: PLUGIN_NAME,
    description: PLUGIN_DESCRIPTION,
    version,
    skills: [
      "skills/websculpt-explore",
      "skills/websculpt-capture",
      "skills/websculpt-maintain",
      "skills/websculpt-library",
    ],
    configSchema: {
      type: "object",
      additionalProperties: false,
    },
    activation: {
      onStartup: false,
    },
  };
}

function ensureEntryFile() {
  const entryPath = path.join(PLUGIN_DIR, "src", "index.js");
  if (fs.existsSync(entryPath)) {
    return;
  }

  log("Creating minimal plugin entry...");
  fs.mkdirSync(path.dirname(entryPath), { recursive: true });
  fs.writeFileSync(
    entryPath,
    `export default {
  id: "${PLUGIN_ID}",
  name: "${PLUGIN_NAME}",
  description: "${PLUGIN_DESCRIPTION}",
  register() {
    // Skills and dependencies are loaded via the plugin manifest.
  },
};
`,
    "utf-8",
  );
}

function runCommand(command, options = {}) {
  log(`Running: ${command}`);
  return execSync(command, {
    cwd: ROOT_DIR,
    stdio: "inherit",
    encoding: "utf-8",
    ...options,
  });
}

function getGitCommitSha() {
  return execSync("git rev-parse HEAD", {
    cwd: ROOT_DIR,
    encoding: "utf-8",
  }).trim();
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

function packPlugin() {
  log("Packing plugin...");

  // Use the project root README as the published plugin README.
  copyRootReadme();

  // Remove inspector reports before packing; they should not be published.
  const reportsDir = path.join(PLUGIN_DIR, "reports");
  if (fs.existsSync(reportsDir)) {
    fs.rmSync(reportsDir, { recursive: true, force: true });
  }

  runCommand("npm pack --ignore-scripts", { cwd: PLUGIN_DIR });

  const files = fs.readdirSync(PLUGIN_DIR).filter((f) => f.endsWith(".tgz"));
  if (files.length !== 1) {
    throw new Error(`Expected exactly one .tgz file, found: ${files.join(", ")}`);
  }

  return path.join(PLUGIN_DIR, files[0]);
}

async function main() {
  const args = process.argv.slice(2);
  const shouldPublish = args.includes("--publish");
  const skipDryRun = args.includes("--skip-dry-run");

  log(`Mode: ${shouldPublish ? "publish" : "build only"}`);

  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error(`Config file not found: ${CONFIG_PATH}`);
  }

  const config = readJson(CONFIG_PATH);
  const version = resolveVersion(config);

  cleanPluginDirectory();
  copySkills(config.skillSources);
  replaceCommandPrefix(path.join(PLUGIN_DIR, "skills"));
  ensureEntryFile();

  const packageJson = generatePackageJson(config, version);
  const manifest = generateManifest(version);

  writeJson(path.join(PLUGIN_DIR, "package.json"), packageJson);
  writeJson(path.join(PLUGIN_DIR, "openclaw.plugin.json"), manifest);

  log("Validating plugin...");
  runCommand(`clawhub package validate ${PLUGIN_DIR}`);

  const tarballPath = packPlugin();
  const commitSha = getGitCommitSha();

  log(`Source commit: ${commitSha}`);
  log(`Tarball: ${tarballPath}`);

  if (!shouldPublish) {
    log("Build complete. Use --publish to publish to ClawHub.");
    return;
  }

  if (!skipDryRun) {
    log("Running dry-run publish...");
    runCommand(
      `clawhub package publish ${tarballPath} --dry-run --source-repo ${SOURCE_REPO} --source-commit ${commitSha}`,
    );
  }

  log("Publishing to ClawHub...");
  runCommand(
    `clawhub package publish ${tarballPath} --source-repo ${SOURCE_REPO} --source-commit ${commitSha}`,
  );

  log(`Published @bqw1013/websculpt-plugin@${version}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
