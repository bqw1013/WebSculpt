import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const errors = [];
const warnings = [];

function collectMarkdownFiles(dir, baseDir = dir) {
	const results = [];
	if (!fs.existsSync(dir)) return results;
	const items = fs.readdirSync(dir, { withFileTypes: true });
	for (const item of items) {
		const fullPath = path.join(dir, item.name);
		if (item.isDirectory()) {
			results.push(...collectMarkdownFiles(fullPath, baseDir));
		} else if (item.name.endsWith(".md")) {
			results.push(path.relative(baseDir, fullPath));
		}
	}
	return results;
}

// 1. Check skill references structural parity between Chinese and English trees
const skillRefsDir = path.join(root, "skills", "websculpt", "references");
const skillEnRefsDir = path.join(root, "skills", "websculpt-en", "references");

const zhFiles = collectMarkdownFiles(skillRefsDir);
const enFiles = collectMarkdownFiles(skillEnRefsDir);

const zhSet = new Set(zhFiles);
const enSet = new Set(enFiles);

for (const f of zhFiles) {
	if (!enSet.has(f)) {
		errors.push(
			`Missing English skill reference: ${path.join("skills", "websculpt-en", "references", f)}`,
		);
	}
}

for (const f of enFiles) {
	if (!zhSet.has(f)) {
		errors.push(
			`Missing Chinese skill reference: ${path.join("skills", "websculpt", "references", f)}`,
		);
	}
}

// 2. Check docs/ has matching docs/en/ files
const docsDir = path.join(root, "docs");
const docsEnDir = path.join(root, "docs", "en");

if (fs.existsSync(docsDir)) {
	const docsFiles = collectMarkdownFiles(docsDir).filter((f) => !f.startsWith("en" + path.sep));

	if (!fs.existsSync(docsEnDir)) {
		errors.push("Missing docs/en/ directory");
	} else {
		const docsEnFiles = collectMarkdownFiles(docsEnDir);

		for (const f of docsFiles) {
			if (!docsEnFiles.includes(f)) {
				errors.push(`Missing English translation in docs/en/: ${f}`);
			}
		}

		for (const f of docsEnFiles) {
			if (!docsFiles.includes(f)) {
				warnings.push(`Extra file in docs/en/ not in docs/: ${f}`);
			}
		}
	}
}

// 3. Check root README files exist
const readmePath = path.join(root, "README.md");
const readmeEnPath = path.join(root, "README_en.md");

if (!fs.existsSync(readmePath)) {
	errors.push("Missing root README.md");
}
if (!fs.existsSync(readmeEnPath)) {
	errors.push("Missing root README_en.md");
}

// Report
let exitCode = 0;

if (errors.length > 0) {
	console.error(`I18N verification failed (${errors.length} error(s)):`);
	for (const e of errors) {
		console.error(`  [ERROR] ${e}`);
	}
	exitCode = 1;
}

if (warnings.length > 0) {
	console.warn(`I18N verification warnings (${warnings.length} warning(s)):`);
	for (const w of warnings) {
		console.warn(`  [WARN]  ${w}`);
	}
}

if (exitCode === 0) {
	console.log("I18N verification passed.");
} else {
	process.exit(exitCode);
}
