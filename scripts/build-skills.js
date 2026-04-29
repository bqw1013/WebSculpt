import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const skillRoot = path.join(root, "skills", "websculpt");
const referencesDir = path.join(skillRoot, "references");
const assetsDir = path.join(skillRoot, "assets");

const dirMappings = [
	{
		from: path.join(root, "src", "explore"),
		to: path.join(referencesDir, "explore"),
	},
	{
		from: path.join(root, "src", "access", "playwright-cli"),
		to: path.join(referencesDir, "access", "playwright-cli"),
	},
	{
		from: path.join(root, "src", "compile"),
		to: path.join(referencesDir, "compile"),
	},
];

function ensureDir(dir) {
	fs.mkdirSync(dir, { recursive: true });
}

function rmrf(dir) {
	if (fs.existsSync(dir)) {
		fs.rmSync(dir, { recursive: true, force: true });
	}
}

function buildSkills() {
	console.log("=== Building skill artifact ===\n");

	// 1. Ensure references/ exists; do NOT remove the root directory itself
	// because it may be locked by a shell cwd or file watcher on Windows.
	ensureDir(referencesDir);

	// 2. Copy source dirs to references/
	for (const { from, to } of dirMappings) {
		if (!fs.existsSync(from)) {
			console.warn(`SKIP: ${path.relative(root, from)} not found`);
			continue;
		}

		// Try to clean the target for a fresh copy. If locked (EBUSY on Windows),
		// skip removal and let cpSync overwrite files in place.
		if (fs.existsSync(to)) {
			try {
				rmrf(to);
				console.log(`CLEAN: ${path.relative(root, to)}`);
			} catch (err) {
				if (err.code === "EBUSY") {
					console.warn(
						`WARN: ${path.relative(root, to)} is busy (shell cwd or file lock); will overwrite in place`,
					);
				} else {
					throw err;
				}
			}
		}

		fs.cpSync(from, to, { recursive: true, force: true });
		console.log(`COPY: ${path.relative(root, from)} -> ${path.relative(root, to)}`);
	}

	// 3. Ensure assets/ exists (empty placeholder for future builtin commands)
	ensureDir(assetsDir);
	console.log(`ENSURE: ${path.relative(root, assetsDir)}`);

	// 4. Generate version.json from package.json
	const packageJsonPath = path.join(root, "package.json");
	let version = "0.0.0";
	try {
		const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
		version = pkg.version || version;
	} catch {
		console.warn(`WARN: Could not read version from ${path.relative(root, packageJsonPath)}`);
	}
	const versionJsonPath = path.join(skillRoot, "version.json");
	fs.writeFileSync(
		versionJsonPath,
		JSON.stringify({ version, builtAt: new Date().toISOString() }, null, 2),
	);
	console.log(`WRITE: ${path.relative(root, versionJsonPath)} (${version})`);

	// 5. Validate required files exist
	const skillMd = path.join(skillRoot, "SKILL.md");
	if (!fs.existsSync(skillMd)) {
		throw new Error(`Validation failed: ${path.relative(root, skillMd)} is missing`);
	}
	if (!fs.existsSync(versionJsonPath)) {
		throw new Error(`Validation failed: ${path.relative(root, versionJsonPath)} is missing`);
	}
	console.log(`VALIDATE: OK`);

	console.log("\n=== Done ===");
}

buildSkills();
