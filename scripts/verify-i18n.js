import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const errors = [];
const warnings = [];

function collectMarkdownFiles(dir) {
	const results = [];
	const items = fs.readdirSync(dir, { withFileTypes: true });
	for (const item of items) {
		const fullPath = path.join(dir, item.name);
		if (item.isDirectory()) {
			results.push(...collectMarkdownFiles(fullPath));
		} else if (item.name.endsWith(".md")) {
			results.push(path.relative(dir, fullPath));
		}
	}
	return results;
}

function extractRelativeLinks(content) {
	const links = [];
	const regex = /\[([^\]]*)\]\(([^)]+)\)/g;
	let match;
	while ((match = regex.exec(content)) !== null) {
		const raw = match[2];
		const linkPath = raw.split("#")[0];
		if (!linkPath || linkPath.startsWith("http://") || linkPath.startsWith("https://") || linkPath.startsWith("/")) {
			continue;
		}
		links.push(linkPath);
	}
	return links;
}

// 1. Check src/ docs have paired .en.md
const srcDocDirs = [
	path.join(root, "src", "explore"),
	path.join(root, "src", "compile"),
	path.join(root, "src", "access", "playwright-cli"),
];

for (const dir of srcDocDirs) {
	if (!fs.existsSync(dir)) continue;
	const files = fs.readdirSync(dir);
	const mdFiles = files.filter((f) => f.endsWith(".md") && !f.endsWith(".en.md"));

	for (const md of mdFiles) {
		const en = `${path.parse(md).name}.en.md`;
		if (!files.includes(en)) {
			errors.push(`Missing English translation: ${path.relative(root, path.join(dir, en))}`);
		}
	}

	const enFiles = files.filter((f) => f.endsWith(".en.md"));
	for (const en of enFiles) {
		const base = en.replace(".en.md", ".md");
		if (!files.includes(base)) {
			errors.push(`Missing Chinese source: ${path.relative(root, path.join(dir, base))} (for ${en})`);
		}
	}
}

// 2. Check link consistency between .md and .en.md
for (const dir of srcDocDirs) {
	if (!fs.existsSync(dir)) continue;
	const files = fs.readdirSync(dir);
	const mdFiles = files.filter((f) => f.endsWith(".md") && !f.endsWith(".en.md"));

	for (const md of mdFiles) {
		const en = `${path.parse(md).name}.en.md`;
		if (!files.includes(en)) continue;

		const mdPath = path.join(dir, md);
		const enPath = path.join(dir, en);

		const mdLinks = extractRelativeLinks(fs.readFileSync(mdPath, "utf-8"));
		const enLinks = extractRelativeLinks(fs.readFileSync(enPath, "utf-8"));

		// English docs must not link to .en.md files (these become dead links after build)
		for (const link of enLinks) {
			if (link.endsWith(".en.md")) {
				errors.push(
					`English doc links to .en.md (dead after build): ${path.relative(root, enPath)} -> ${link}`,
				);
			}
		}

		// Warn if link sets differ
		const mdSet = new Set(mdLinks);
		const enSet = new Set(enLinks);

		for (const link of mdSet) {
			if (!enSet.has(link)) {
				warnings.push(`Link only in Chinese doc: ${path.relative(root, mdPath)} -> ${link}`);
			}
		}
		for (const link of enSet) {
			if (!mdSet.has(link)) {
				warnings.push(`Link only in English doc: ${path.relative(root, enPath)} -> ${link}`);
			}
		}
	}
}

// 3. Check docs/ has matching docs/en/ files
const docsDir = path.join(root, "docs");
const docsEnDir = path.join(root, "docs", "en");

if (fs.existsSync(docsDir)) {
	const docsFiles = collectMarkdownFiles(docsDir).filter((f) => !f.startsWith("en" + path.sep));

	if (!fs.existsSync(docsEnDir)) {
		errors.push("Missing docs/en/ directory");
	} else {
		const enFiles = collectMarkdownFiles(docsEnDir);

		for (const f of docsFiles) {
			if (!enFiles.includes(f)) {
				errors.push(`Missing English translation in docs/en/: ${f}`);
			}
		}

		for (const f of enFiles) {
			if (!docsFiles.includes(f)) {
				warnings.push(`Extra file in docs/en/ not in docs/: ${f}`);
			}
		}
	}
}

// 4. Check built skill artifacts
const skillEnDir = path.join(root, "skills", "websculpt-en");
if (!fs.existsSync(skillEnDir)) {
	errors.push("Missing skills/websculpt-en/. Run `npm run build:skills` first.");
} else {
	if (!fs.existsSync(path.join(skillEnDir, "SKILL.md"))) {
		errors.push("Missing skills/websculpt-en/SKILL.md");
	}

	const refDir = path.join(skillEnDir, "references");
	if (fs.existsSync(refDir)) {
		const enMdArtifacts = collectMarkdownFiles(refDir).filter((f) => f.endsWith(".en.md"));
		for (const f of enMdArtifacts) {
			errors.push(`Build artifact should not contain .en.md files: references/${f}`);
		}
	}
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
