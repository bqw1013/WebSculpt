import { access, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { isLoadError, loadCommandSource } from "../../../../src/cli/meta/lib/command-source-loader.js";
import { validateCommandSource } from "../../../../src/cli/meta/lib/command-validation.js";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const BUILTIN_DIR = join(REPO_ROOT, "src", "cli", "builtin");

/**
 * Collects every command package directory under a given directory.
 * A package is a nested directory <domain>/<action> containing manifest.json.
 */
async function collectCommandDirs(root: string): Promise<string[]> {
	const dirs: string[] = [];
	for (const domain of await readdir(root)) {
		const domainDir = join(root, domain);
		const entries = await readdir(domainDir);
		for (const entry of entries) {
			const actionDir = join(domainDir, entry);
			if (!entry.startsWith(".") && (await isCommandDir(actionDir))) {
				dirs.push(actionDir);
			}
		}
	}
	return dirs.sort();
}

async function isCommandDir(dir: string): Promise<boolean> {
	try {
		await access(join(dir, "manifest.json"));
		return true;
	} catch {
		return false;
	}
}

describe("builtin command library passes static validation", () => {
	it("every builtin command passes L1-L3 validation without error-level details", async () => {
		const commandDirs = await collectCommandDirs(BUILTIN_DIR);
		expect(commandDirs.length).toBeGreaterThan(0);

		const offenders: string[] = [];
		for (const dir of commandDirs) {
			const loaded = await loadCommandSource(dir);
			if (isLoadError(loaded)) {
				offenders.push(`${dir}: ${loaded.error.message}`);
				continue;
			}
			const { manifest, code, hasReadme, hasContext, readmeContent, contextContent } = loaded;
			const details = validateCommandSource({
				manifest,
				code,
				hasReadme,
				hasContext,
				readmeContent,
				contextContent,
			});
			const errors = details.filter((d) => d.level === "error");
			for (const error of errors) {
				offenders.push(`${dir}: ${error.code}: ${error.message}`);
			}
		}

		expect(offenders, `Commands failing static validation:\n${offenders.join("\n")}`).toHaveLength(0);
	});
});
