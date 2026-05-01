import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const skillRoot = path.join(root, "skills", "websculpt");
const skillEnRoot = path.join(root, "skills", "websculpt-en");

const sourceMappings = [
	{
		from: path.join(root, "src", "explore"),
		rel: path.join("explore"),
	},
	{
		from: path.join(root, "src", "access", "playwright-cli"),
		rel: path.join("access", "playwright-cli"),
	},
	{
		from: path.join(root, "src", "compile"),
		rel: path.join("compile"),
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

function processEnMarkdownFiles(dir) {
	const items = fs.readdirSync(dir, { withFileTypes: true });
	for (const item of items) {
		const fullPath = path.join(dir, item.name);
		if (item.isDirectory()) {
			processEnMarkdownFiles(fullPath);
		} else if (item.name.endsWith(".en.md")) {
			const baseName = item.name.replace(".en.md", ".md");
			const basePath = path.join(dir, baseName);
			fs.copyFileSync(fullPath, basePath);
			fs.rmSync(fullPath);
		}
	}
}

function readVersion() {
	const packageJsonPath = path.join(root, "package.json");
	try {
		const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
		return pkg.version || "0.0.0";
	} catch {
		console.warn(`WARN: Could not read version from ${path.relative(root, packageJsonPath)}`);
		return "0.0.0";
	}
}

function buildSkillPackage(targetRoot, processEn) {
	const referencesDir = path.join(targetRoot, "references");
	const assetsDir = path.join(targetRoot, "assets");

	ensureDir(referencesDir);

	for (const { from, rel } of sourceMappings) {
		if (!fs.existsSync(from)) {
			console.warn(`SKIP: ${path.relative(root, from)} not found`);
			continue;
		}

		const to = path.join(referencesDir, rel);

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

		if (processEn) {
			processEnMarkdownFiles(to);
			console.log(`PROCESS: ${path.relative(root, to)} (.en.md -> .md)`);
		}
	}

	ensureDir(assetsDir);
	console.log(`ENSURE: ${path.relative(root, assetsDir)}`);

	const version = readVersion();
	const versionJsonPath = path.join(targetRoot, "version.json");
	fs.writeFileSync(
		versionJsonPath,
		JSON.stringify({ version, builtAt: new Date().toISOString() }, null, 2),
	);
	console.log(`WRITE: ${path.relative(root, versionJsonPath)} (${version})`);

	const skillMd = path.join(targetRoot, "SKILL.md");
	if (!fs.existsSync(skillMd)) {
		throw new Error(`Validation failed: ${path.relative(root, skillMd)} is missing`);
	}
	if (!fs.existsSync(versionJsonPath)) {
		throw new Error(`Validation failed: ${path.relative(root, versionJsonPath)} is missing`);
	}
	console.log(`VALIDATE: ${path.relative(root, targetRoot)} OK`);
}

function buildSkills() {
	console.log("=== Building skill artifacts ===\n");

	buildSkillPackage(skillRoot, false);
	console.log("");
	buildSkillPackage(skillEnRoot, true);

	console.log("\n=== Done ===");
}

buildSkills();
