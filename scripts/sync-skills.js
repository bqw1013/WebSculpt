import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const isClean = process.argv.includes('--clean');

const skillRoot = path.join(root, 'skills', 'websculpt');
const referencesDir = path.join(skillRoot, 'references');
const assetsDir = path.join(skillRoot, 'assets');

const dirMappings = [
  {
    from: path.join(root, 'src', 'explore'),
    to: path.join(referencesDir, 'explore'),
  },
  {
    from: path.join(root, 'src', 'access', 'playwright-cli'),
    to: path.join(referencesDir, 'access', 'playwright-cli'),
  },
];

const agentTargets = [
  path.join(root, '.claude', 'skills', 'websculpt'),
  path.join(root, '.codex', 'skills', 'websculpt'),
  path.join(root, '.agents', 'skills', 'websculpt'),
];

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function rmrf(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function copyFile(src, dest) {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function syncSkill() {
  console.log('=== Syncing skill sources ===\n');

  // 1. Clean and recreate references/
  rmrf(referencesDir);
  ensureDir(referencesDir);

  // 2. Copy source dirs to references/
  for (const { from, to } of dirMappings) {
    if (!fs.existsSync(from)) {
      console.warn(`SKIP: ${path.relative(root, from)} not found`);
      continue;
    }
    fs.cpSync(from, to, { recursive: true, force: true });
    console.log(`COPY: ${path.relative(root, from)} -> ${path.relative(root, to)}`);
  }

  // 3. Ensure assets/ exists (empty placeholder for future builtin commands)
  ensureDir(assetsDir);
  console.log(`ENSURE: ${path.relative(root, assetsDir)}`);

  // 4. Validate SKILL.md exists
  const skillMd = path.join(skillRoot, 'SKILL.md');
  if (!fs.existsSync(skillMd)) {
    console.warn(`WARN: ${path.relative(root, skillMd)} not found. Create it manually.`);
  } else {
    console.log(`OK: ${path.relative(root, skillMd)}`);
  }

  console.log('');
}

function deployToAgents() {
  console.log('=== Deploying to agent skill directories ===\n');

  for (const agentDir of agentTargets) {
    rmrf(agentDir);
    fs.cpSync(skillRoot, agentDir, { recursive: true, force: true });
    console.log(`DEPLOY: ${path.relative(root, skillRoot)} -> ${path.relative(root, agentDir)}`);
  }
}

function cleanAgents() {
  console.log('=== Cleaning agent skill directories ===\n');

  for (const agentDir of agentTargets) {
    rmrf(agentDir);
    if (!fs.existsSync(agentDir)) {
      console.log(`CLEAN: ${path.relative(root, agentDir)}`);
    }
  }
}

if (isClean) {
  cleanAgents();
} else {
  syncSkill();
  deployToAgents();
}

console.log('=== Done ===');
